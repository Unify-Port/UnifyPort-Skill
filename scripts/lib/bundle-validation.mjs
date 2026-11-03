import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { CatalogValidationError, validateCatalogFiles } from './catalog-validation.mjs';

// 发布目录会被完整公开并在用户机器执行，因此校验基于物理文件而非 ignore 推断。
const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;
const REQUIRED_FILES = new Set([
  'SKILL.md',
  'SKILL.zh-CN.md',
  'references/operations.json',
  'references/events.json',
  'references/en/overview.md',
  'references/zh-CN/overview.md',
  'references/en/safety.md',
  'references/zh-CN/safety.md',
  'references/en/workflows.md',
  'references/zh-CN/workflows.md',
  'references/en/guides.md',
  'references/zh-CN/guides.md',
  'references/en/provider-capabilities.md',
  'references/zh-CN/provider-capabilities.md',
  'references/en/webhooks.md',
  'references/zh-CN/webhooks.md',
  'references/en/errors.md',
  'references/zh-CN/errors.md',
]);
const SAFE_SCRIPT_HOSTS = new Set(['api.unifyport.ai', 'www.unifyport.ai']);
const EXECUTABLE_FENCE_LANGUAGES = new Set(['bash', 'sh', 'shell', 'javascript', 'js', 'mjs', 'http']);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const GUIDE_IDS_BY_FILE = Object.freeze({
  'guides.md': [
    'introduction',
    'quickstart',
    'account-lifecycle',
    'provider-auth-telegram',
    'provider-auth-line',
    'provider-auth-zalo',
    'provider-auth-twitter',
    'provider-auth-whatsapp',
    'provider-auth-facebook',
  ],
  'provider-capabilities.md': [
    'provider-message-support',
    'provider-actions-support',
    'provider-webhook-events',
  ],
  'webhooks.md': ['webhook-delivery', 'webhook-events'],
  'errors.md': ['error-reference'],
});
const PROVIDER_MATRIX_IDS = Object.freeze(['message-sending', 'actions', 'webhook-events']);
const WEBHOOK_SEMANTIC_TOKENS = Object.freeze([
  'X-Device-Event-Id',
  'X-Device-Delivery-Id',
  'X-Device-Timestamp',
  'X-Device-Signature',
  'HMAC-SHA256',
  '<timestamp>.<raw-body>',
  '2xx',
  '408',
  '429',
  '5xx',
]);
const ERROR_HTTP_GROUPS = Object.freeze(['400', '401', '404', '409', '500', '501', '502', '503']);

export class BundleValidationError extends Error {
  constructor(issues) {
    super(`Bundle validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'BundleValidationError';
    this.issues = issues;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addIssue(issues, condition, message) {
  if (!condition) {
    issues.push(message);
  }
}

function isAllowedFile(relativePath) {
  if (/[\\\x00-\x1f]/.test(relativePath)) {
    return false;
  }
  if (relativePath === 'SKILL.md' || relativePath === 'SKILL.zh-CN.md' || relativePath === '.clawhubignore') {
    return true;
  }
  if (/^references\/(?!.*(?:^|\/)\.)[^\0]+\.(?:md|json)$/.test(relativePath)) {
    return true;
  }
  return /^scripts\/[^/.][^/]*\.mjs$/.test(relativePath);
}

async function collectEntries(root) {
  const files = [];
  const issues = [];

  async function visit(absoluteDirectory, relativeDirectory = '') {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));

    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const stats = await lstat(absolutePath);

      if (entry.name.startsWith('.') && relativePath !== '.clawhubignore') {
        issues.push(`hidden path is not publishable: ${relativePath}`);
      }
      if (stats.isSymbolicLink()) {
        issues.push(`symbolic links are forbidden: ${relativePath}`);
        continue;
      }
      if (stats.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }
      if (!stats.isFile()) {
        issues.push(`special filesystem entry is forbidden: ${relativePath}`);
        continue;
      }

      files.push({ absolutePath, relativePath, size: stats.size });
    }
  }

  await visit(root);
  return { files, issues };
}

function stripInlineComment(value) {
  return value.replace(/\s+#.*$/, '').trim();
}

function parseScalar(rawValue, lineNumber) {
  const value = stripInlineComment(rawValue);
  if (value === '' || value === '~' || value === 'null') {
    return null;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`invalid double-quoted value on frontmatter line ${lineNumber}: ${error.message}`);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) {
      throw new Error(`unterminated single-quoted value on frontmatter line ${lineNumber}`);
    }
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) {
      throw new Error(`unterminated inline array on frontmatter line ${lineNumber}`);
    }
    const inner = value.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((entry) => parseScalar(entry.trim(), lineNumber));
  }
  if (value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`invalid inline object on frontmatter line ${lineNumber}: ${error.message}`);
    }
  }
  return value;
}

function tokenizeYaml(source) {
  const tokens = [];
  source.split(/\r?\n/).forEach((line, index) => {
    if (line.includes('\t')) {
      throw new Error(`tabs are not allowed in frontmatter line ${index + 1}`);
    }
    if (/^\s*(?:#.*)?$/.test(line)) {
      return;
    }
    const indent = line.match(/^ */)[0].length;
    tokens.push({ indent, text: line.slice(indent), lineNumber: index + 1 });
  });
  return tokens;
}

function splitMappingEntry(text, lineNumber) {
  const match = /^([A-Za-z0-9_-]+):(.*)$/.exec(text);
  if (!match) {
    throw new Error(`invalid mapping entry on frontmatter line ${lineNumber}`);
  }
  return { key: match[1], rawValue: match[2].trim() };
}

function parseYamlSubset(source) {
  const tokens = tokenizeYaml(source);

  function parseBlock(startIndex, indent) {
    if (startIndex >= tokens.length) {
      return { value: null, nextIndex: startIndex };
    }
    return tokens[startIndex].text.startsWith('-')
      ? parseSequence(startIndex, indent)
      : parseMapping(startIndex, indent);
  }

  function parseBlockScalar(startIndex, parentIndent, folded) {
    const lines = [];
    let index = startIndex;
    while (index < tokens.length && tokens[index].indent > parentIndent) {
      lines.push(tokens[index].text);
      index += 1;
    }
    return { value: lines.join(folded ? ' ' : '\n'), nextIndex: index };
  }

  function parseMapping(startIndex, indent) {
    const result = {};
    let index = startIndex;
    while (index < tokens.length && tokens[index].indent === indent && !tokens[index].text.startsWith('-')) {
      const token = tokens[index];
      const { key, rawValue } = splitMappingEntry(token.text, token.lineNumber);
      if (Object.hasOwn(result, key)) {
        throw new Error(`duplicate frontmatter key ${key} on line ${token.lineNumber}`);
      }

      if (/^[>|][+-]?$/.test(rawValue)) {
        const parsed = parseBlockScalar(index + 1, indent, rawValue.startsWith('>'));
        result[key] = parsed.value;
        index = parsed.nextIndex;
        continue;
      }
      if (rawValue !== '') {
        result[key] = parseScalar(rawValue, token.lineNumber);
        index += 1;
        continue;
      }
      if (index + 1 < tokens.length && tokens[index + 1].indent > indent) {
        const parsed = parseBlock(index + 1, tokens[index + 1].indent);
        result[key] = parsed.value;
        index = parsed.nextIndex;
      } else {
        result[key] = null;
        index += 1;
      }
    }
    return { value: result, nextIndex: index };
  }

  function parseSequence(startIndex, indent) {
    const result = [];
    let index = startIndex;
    while (index < tokens.length && tokens[index].indent === indent && tokens[index].text.startsWith('-')) {
      const token = tokens[index];
      const content = token.text.slice(1).trim();
      if (content === '') {
        if (index + 1 >= tokens.length || tokens[index + 1].indent <= indent) {
          result.push(null);
          index += 1;
        } else {
          const parsed = parseBlock(index + 1, tokens[index + 1].indent);
          result.push(parsed.value);
          index = parsed.nextIndex;
        }
        continue;
      }

      if (/^[A-Za-z0-9_-]+:/.test(content)) {
        const { key, rawValue } = splitMappingEntry(content, token.lineNumber);
        const item = { [key]: parseScalar(rawValue, token.lineNumber) };
        index += 1;
        if (index < tokens.length && tokens[index].indent > indent) {
          const parsed = parseMapping(index, tokens[index].indent);
          for (const [nestedKey, nestedValue] of Object.entries(parsed.value)) {
            if (Object.hasOwn(item, nestedKey)) {
              throw new Error(`duplicate frontmatter key ${nestedKey} near line ${token.lineNumber}`);
            }
            item[nestedKey] = nestedValue;
          }
          index = parsed.nextIndex;
        }
        result.push(item);
        continue;
      }

      result.push(parseScalar(content, token.lineNumber));
      index += 1;
    }
    return { value: result, nextIndex: index };
  }

  if (tokens.length === 0) {
    return {};
  }
  if (tokens[0].indent !== 0) {
    throw new Error('frontmatter must start at indentation level zero');
  }
  const parsed = parseBlock(0, 0);
  if (parsed.nextIndex !== tokens.length || !isRecord(parsed.value)) {
    throw new Error('frontmatter must be one YAML mapping');
  }
  return parsed.value;
}

export function parseFrontmatter(markdown) {
  const normalized = markdown.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) {
    throw new Error('SKILL.md must start with YAML frontmatter');
  }
  const endIndex = normalized.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    throw new Error('SKILL.md frontmatter is not terminated');
  }
  return parseYamlSubset(normalized.slice(4, endIndex));
}

function validateHomepage(value, issues) {
  let homepage;
  try {
    homepage = new URL(value);
  } catch {
    issues.push('metadata.openclaw.homepage must be a valid URL');
    return;
  }
  addIssue(issues, homepage.origin === 'https://www.unifyport.ai', 'metadata.openclaw.homepage must use the exact public origin https://www.unifyport.ai');
  addIssue(issues, homepage.username === '' && homepage.password === '', 'metadata.openclaw.homepage must not contain URL credentials');
  addIssue(issues, homepage.search === '', 'metadata.openclaw.homepage must not contain query parameters');
  addIssue(issues, homepage.pathname === '/docs/' || homepage.pathname === '/zh-CN/docs/', 'metadata.openclaw.homepage must point to the public Device API docs');
}

export function validateSkillFrontmatter(markdown) {
  const issues = [];
  let frontmatter;
  try {
    frontmatter = parseFrontmatter(markdown);
  } catch (error) {
    throw new BundleValidationError([error.message]);
  }

  addIssue(issues, frontmatter.name === 'unifyport-device-api', 'frontmatter name must equal unifyport-device-api');
  addIssue(issues, frontmatter.version === '1.0.0', 'frontmatter version must equal 1.0.0');
  addIssue(issues, typeof frontmatter.description === 'string' && frontmatter.description.trim().length >= 20, 'frontmatter description must be meaningful');
  addIssue(issues, isRecord(frontmatter.metadata), 'frontmatter metadata must be an object');

  const openclaw = frontmatter.metadata?.openclaw;
  addIssue(issues, isRecord(openclaw), 'frontmatter metadata.openclaw must be an object');
  if (isRecord(openclaw)) {
    addIssue(issues, isRecord(openclaw.requires), 'metadata.openclaw.requires must be an object');
    if (isRecord(openclaw.requires)) {
      addIssue(issues, Array.isArray(openclaw.requires.bins) && openclaw.requires.bins.length === 1 && openclaw.requires.bins[0] === 'node', 'metadata.openclaw.requires.bins must equal [node]');
      addIssue(issues, !Object.hasOwn(openclaw.requires, 'env') || (Array.isArray(openclaw.requires.env) && openclaw.requires.env.length === 0), 'UNIFYPORT_API_KEY is optional and must not appear in requires.env');
    }
    addIssue(issues, !Object.hasOwn(openclaw, 'install'), 'metadata.openclaw.install is forbidden because the bundle has no external dependencies');
    addIssue(issues, openclaw.primaryEnv === 'UNIFYPORT_API_KEY', 'metadata.openclaw.primaryEnv must equal UNIFYPORT_API_KEY');
    addIssue(issues, Array.isArray(openclaw.envVars) && openclaw.envVars.length === 1, 'metadata.openclaw.envVars must declare exactly one variable');
    if (Array.isArray(openclaw.envVars) && openclaw.envVars.length === 1) {
      const variable = openclaw.envVars[0];
      addIssue(issues, isRecord(variable), 'metadata.openclaw.envVars[0] must be an object');
      if (isRecord(variable)) {
        addIssue(issues, variable.name === 'UNIFYPORT_API_KEY', 'metadata.openclaw.envVars[0].name must equal UNIFYPORT_API_KEY');
        addIssue(issues, variable.required === false, 'metadata.openclaw.envVars[0].required must be false');
      }
    }
    validateHomepage(openclaw.homepage, issues);
  }

  if (issues.length > 0) {
    throw new BundleValidationError(issues);
  }
  return frontmatter;
}

function stripFrontmatter(markdown) {
  const normalized = markdown.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) {
    return normalized;
  }
  const endIndex = normalized.indexOf('\n---\n', 4);
  return endIndex === -1 ? normalized : normalized.slice(endIndex + 5);
}

function extractMarkdownShape(markdown) {
  const headings = [];
  const fences = [];
  const links = [];
  const lines = stripFrontmatter(markdown).split('\n');
  let activeFence = null;

  for (const line of lines) {
    const fence = /^```\s*([A-Za-z0-9_-]*)\s*$/.exec(line);
    if (fence) {
      if (activeFence) {
        fences.push(activeFence);
        activeFence = null;
      } else {
        activeFence = { language: fence[1].toLowerCase(), lines: [] };
      }
      continue;
    }
    if (activeFence) {
      activeFence.lines.push(line);
      continue;
    }

    const heading = /^(#{1,6})\s+\S/.exec(line);
    if (heading) {
      headings.push(heading[1].length);
    }
    for (const match of line.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push(normalizeLocalizedLink(match[1]));
    }
  }

  return {
    headings,
    fences: fences.map((entry) => ({
      language: entry.language,
      content: entry.lines.join('\n').trim(),
    })),
    links,
    unterminatedFence: activeFence !== null,
  };
}

function normalizeLocalizedLink(value) {
  return value
    .replace(/\/(?:zh-CN\/)?docs\//, '/{locale}/docs/')
    .replace('/references/zh-CN/', '/references/{locale}/')
    .replace('/references/en/', '/references/{locale}/')
    .replace('../zh-CN/', '../{locale}/')
    .replace('../en/', '../{locale}/')
    .replace('references/zh-CN/', 'references/{locale}/')
    .replace('references/en/', 'references/{locale}/');
}

function validateMarkdownParity(enMarkdown, zhMarkdown, label, issues) {
  const en = extractMarkdownShape(enMarkdown);
  const zh = extractMarkdownShape(zhMarkdown);
  addIssue(issues, !en.unterminatedFence && !zh.unterminatedFence, `${label} must not contain unterminated code fences`);
  addIssue(issues, JSON.stringify(en.headings) === JSON.stringify(zh.headings), `${label} heading levels must match across English and Chinese`);
  addIssue(issues, JSON.stringify(en.fences.map((entry) => entry.language)) === JSON.stringify(zh.fences.map((entry) => entry.language)), `${label} code fence languages must match across English and Chinese`);
  addIssue(issues, JSON.stringify([...en.links].sort()) === JSON.stringify([...zh.links].sort()), `${label} link targets must match across English and Chinese`);

  const enExecutable = en.fences.filter((entry) => EXECUTABLE_FENCE_LANGUAGES.has(entry.language));
  const zhExecutable = zh.fences.filter((entry) => EXECUTABLE_FENCE_LANGUAGES.has(entry.language));
  addIssue(issues, JSON.stringify(enExecutable) === JSON.stringify(zhExecutable), `${label} executable examples must be identical across English and Chinese`);
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 0
    || parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
    || parts[0] >= 224;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^(?:fe[89ab])/.test(normalized)
    || normalized.startsWith('2001:db8:');
}

function isPrivateHostname(hostname) {
  const labels = hostname.toLowerCase().split('.');
  return hostname === 'localhost'
    || isPrivateIpv4(hostname)
    || isPrivateIpv6(hostname)
    || ['local', 'internal', 'corp', 'lan'].some((suffix) => hostname.endsWith(`.${suffix}`))
    || labels.some((label) => ['dev', 'development', 'stage', 'staging', 'qa', 'preprod'].includes(label));
}

function isPlaceholder(value) {
  return /^(?:<[^>]+>|\$\{[^}]+\}|your[_ -]|example|placeholder|redacted|replace[_ -]|test[_ -])/i.test(value);
}

function isCredentialReference(value) {
  return /^(?:(?:process\.)?env\.)?UNIFYPORT_API_KEY$/.test(value);
}

export function scanSensitiveContent(relativePath, text, { runtime = relativePath.startsWith('scripts/') } = {}) {
  const issues = [];
  const patterns = [
    ['private key material', /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/i],
    ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ['GitHub token', /\b(?:gh[opusr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
    ['ClawHub token', /\bclh_[A-Za-z0-9_-]{16,}\b/],
    ['OpenAI-style token', /\bsk-[A-Za-z0-9_-]{24,}\b/],
    ['database or cache connection string', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\//i],
    ['internal API path', /\/(?:api\/)?v\d+\/internal(?:\/|\b)/i],
    ['internal credential field', /\b(?:access[^a-z0-9]?key[^a-z0-9]?secret|security[^a-z0-9]?token|temporary[^a-z0-9]?credentials|sts[^a-z0-9]?token)\b/i],
    ['internal upload route', /\b(?:oss[\/_-]?upload|upload[-_]?token)\b/i],
    ['local filesystem path', /(?:\/Users\/[^\s"'`]+|\/home\/[^\s"'`]+|[A-Za-z]:\\Users\\[^\s"'`]+)/],
    ['source map directive', /[#@]\s*sourceMappingURL\s*=/],
    ['WhatsApp-style personal identifier', /\b\d{8,}@(s\.whatsapp\.net|g\.us)\b/i],
  ];

  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) {
      issues.push(`${relativePath} contains ${label}`);
    }
  }

  for (const match of text.matchAll(/\bBearer\s+([A-Za-z0-9._~+/=-]{20,})\b/gi)) {
    if (!isPlaceholder(match[1])) {
      issues.push(`${relativePath} contains an apparent bearer credential`);
      break;
    }
  }
  for (const match of text.matchAll(/["']?(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)["']?\s*[:=]\s*(?:["']([^"']{8,})["']|([A-Za-z0-9._~+/-]{12,}))/gi)) {
    const value = match[1] ?? match[2];
    if (!isPlaceholder(value) && !isCredentialReference(value)) {
      issues.push(`${relativePath} contains an apparent assigned credential`);
      break;
    }
  }
  for (const match of text.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)) {
    const domain = match[1].toLowerCase();
    if (!['example.com', 'example.org', 'example.net'].includes(domain)) {
      issues.push(`${relativePath} contains an apparent email address`);
      break;
    }
  }
  if (/\+\d[\d ()-]{7,}\d/.test(text)) {
    issues.push(`${relativePath} contains an apparent international phone number`);
  }

  for (const match of text.matchAll(/https?:\/\/[^\s<>)\]"'`]+/gi)) {
    let parsed;
    try {
      parsed = new URL(match[0]);
    } catch {
      continue;
    }
    if (parsed.username || parsed.password) {
      issues.push(`${relativePath} contains URL credentials`);
    }
    if (isPrivateHostname(parsed.hostname)) {
      issues.push(`${relativePath} contains a private or pre-production host`);
    }
    if (runtime && !SAFE_SCRIPT_HOSTS.has(parsed.hostname)) {
      issues.push(`${relativePath} executable code references a non-UnifyPort host`);
    }
    if (runtime && (parsed.protocol !== 'https:' || parsed.port !== '')) {
      issues.push(`${relativePath} executable code must use HTTPS on the default port`);
    }
  }

  if (relativePath.endsWith('.mjs')) {
    const imports = [
      ...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g),
      ...text.matchAll(/\bimport\s*["']([^"']+)["']/g),
    ];
    for (const match of imports) {
      const specifier = match[1];
      if (!specifier.startsWith('node:') && !specifier.startsWith('./') && !specifier.startsWith('../')) {
        issues.push(`${relativePath} imports external package ${specifier}`);
      }
      if (runtime && /^node:(?:child_process|cluster|module|vm|worker_threads)$/.test(specifier)) {
        issues.push(`${relativePath} imports disallowed execution primitive ${specifier}`);
      }
      if (runtime && specifier.startsWith('../')) {
        issues.push(`${relativePath} imports a path outside the runtime script directory`);
      }
    }
    if (runtime && /\bimport\s*\(\s*(?!["'])/.test(text)) {
      issues.push(`${relativePath} uses a dynamic non-literal import`);
    }
  }

  if (runtime) {
    const environmentReads = new Set();
    for (const match of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      environmentReads.add(match[1]);
    }
    for (const match of text.matchAll(/process\.env\[['"]([^'"]+)['"]\]/g)) {
      environmentReads.add(match[1]);
    }
    const unsafeEnvironmentAccess = text
      .replace(/(?:=\s*|\?\?\s*)process\.env\b/g, '')
      .match(/process\.env(?![.[])/);
    if (unsafeEnvironmentAccess) {
      issues.push(`${relativePath} reads process.env dynamically`);
    }
    if (/(?:Object\.(?:keys|values|entries)|JSON\.stringify)\s*\(\s*(?:process\.env|env)\b|\.\.\.(?:process\.env|env)\b|for\s*\([^)]*\bin\s+(?:process\.env|env)\b/.test(text)) {
      issues.push(`${relativePath} enumerates environment data`);
    }
    for (const name of environmentReads) {
      if (name !== 'UNIFYPORT_API_KEY') {
        issues.push(`${relativePath} reads undeclared environment variable ${name}`);
      }
    }
  }

  return [...new Set(issues)];
}

async function validateLocaleReferences(fileMap, issues) {
  const enPrefix = 'references/en/';
  const zhPrefix = 'references/zh-CN/';
  const enFiles = [...fileMap.keys()].filter((name) => name.startsWith(enPrefix) && name.endsWith('.md')).map((name) => name.slice(enPrefix.length)).sort();
  const zhFiles = [...fileMap.keys()].filter((name) => name.startsWith(zhPrefix) && name.endsWith('.md')).map((name) => name.slice(zhPrefix.length)).sort();
  addIssue(issues, JSON.stringify(enFiles) === JSON.stringify(zhFiles), 'references/en and references/zh-CN must contain the same Markdown files');

  for (const relativeName of enFiles) {
    const en = fileMap.get(`${enPrefix}${relativeName}`);
    const zh = fileMap.get(`${zhPrefix}${relativeName}`);
    if (en !== undefined && zh !== undefined) {
      validateMarkdownParity(en, zh, `references/${relativeName}`, issues);
    }
  }
}

function validateReferenceCoverage(fileMap, issues) {
  const guideIds = Object.values(GUIDE_IDS_BY_FILE).flat();
  addIssue(issues, guideIds.length === 15 && new Set(guideIds).size === 15, 'maintainer guide coverage must define exactly 15 unique public guide IDs');

  for (const locale of ['en', 'zh-CN']) {
    for (const [fileName, expectedIds] of Object.entries(GUIDE_IDS_BY_FILE)) {
      const relativePath = `references/${locale}/${fileName}`;
      const text = fileMap.get(relativePath);
      if (text === undefined) {
        continue;
      }
      for (const id of expectedIds) {
        addIssue(issues, text.includes(`\`${id}\``), `${relativePath} must cover public guide id ${id}`);
      }
    }

    const providerPath = `references/${locale}/provider-capabilities.md`;
    const providerText = fileMap.get(providerPath);
    if (providerText !== undefined) {
      for (const id of PROVIDER_MATRIX_IDS) {
        addIssue(issues, providerText.includes(`\`${id}\``), `${providerPath} must cover provider matrix ${id}`);
      }
      const matrixHeaders = providerText
        .split(/\r?\n/)
        .filter((line) => line.startsWith('|')
          && ['Telegram', 'WhatsApp', 'X', 'LINE', 'Zalo'].every((provider) => line.includes(`| ${provider} |`)));
      addIssue(issues, matrixHeaders.length === 3, `${providerPath} must contain exactly three five-provider matrix headers`);
    }

    const webhookPath = `references/${locale}/webhooks.md`;
    const webhookText = fileMap.get(webhookPath);
    if (webhookText !== undefined) {
      for (const token of WEBHOOK_SEMANTIC_TOKENS) {
        addIssue(issues, webhookText.includes(token), `${webhookPath} must preserve webhook semantic token ${token}`);
      }
    }

    const errorsPath = `references/${locale}/errors.md`;
    const errorsText = fileMap.get(errorsPath);
    if (errorsText !== undefined) {
      for (const status of ERROR_HTTP_GROUPS) {
        addIssue(issues, errorsText.includes(`\`${status}\``), `${errorsPath} must cover HTTP group ${status}`);
      }
    }
  }
}

export async function validateBundle(skillRoot, { maxBundleBytes = MAX_BUNDLE_BYTES } = {}) {
  const absoluteRoot = path.resolve(skillRoot);
  const rootStats = await lstat(absoluteRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new BundleValidationError(['skill root must be a real directory']);
  }

  const { files, issues } = await collectEntries(absoluteRoot);
  const fileMap = new Map();
  let totalBytes = 0;

  for (const file of files) {
    totalBytes += file.size;
    addIssue(issues, isAllowedFile(file.relativePath), `file is outside the exact publish allowlist: ${file.relativePath}`);
    if (/\.map$/i.test(file.relativePath)) {
      issues.push(`source maps are forbidden: ${file.relativePath}`);
    }
    if (/(?:^|\/)\.env(?:\.|$)/i.test(file.relativePath)) {
      issues.push(`environment files are forbidden: ${file.relativePath}`);
    }
    if (/(?:^|\/)(?:id_rsa|id_ed25519|[^/]+\.(?:pem|key|p12|pfx))$/i.test(file.relativePath)) {
      issues.push(`credential file is forbidden: ${file.relativePath}`);
    }

    const buffer = await readFile(file.absolutePath);
    if (buffer.includes(0)) {
      issues.push(`binary content is forbidden: ${file.relativePath}`);
      continue;
    }
    let text;
    try {
      text = UTF8_DECODER.decode(buffer);
    } catch {
      issues.push(`file must be valid UTF-8 text: ${file.relativePath}`);
      continue;
    }
    fileMap.set(file.relativePath, text);
    issues.push(...scanSensitiveContent(file.relativePath, text));
  }

  addIssue(issues, totalBytes <= maxBundleBytes, `bundle size ${totalBytes} exceeds limit ${maxBundleBytes}`);
  for (const requiredFile of REQUIRED_FILES) {
    addIssue(issues, fileMap.has(requiredFile), `required bundle file is missing: ${requiredFile}`);
  }
  addIssue(issues, [...fileMap.keys()].some((name) => /^scripts\/[^/]+\.mjs$/.test(name)), 'bundle must contain at least one self-contained .mjs runtime script');

  if (fileMap.has('SKILL.md')) {
    try {
      validateSkillFrontmatter(fileMap.get('SKILL.md'));
    } catch (error) {
      if (error instanceof BundleValidationError) {
        issues.push(...error.issues);
      } else {
        issues.push(`SKILL.md frontmatter could not be validated: ${error.message}`);
      }
    }
  }
  if (fileMap.has('SKILL.md') && fileMap.has('SKILL.zh-CN.md')) {
    validateMarkdownParity(fileMap.get('SKILL.md'), fileMap.get('SKILL.zh-CN.md'), 'SKILL documents', issues);
  }
  await validateLocaleReferences(fileMap, issues);
  validateReferenceCoverage(fileMap, issues);

  try {
    await validateCatalogFiles(absoluteRoot);
  } catch (error) {
    if (error instanceof CatalogValidationError) {
      issues.push(...error.issues.map((issue) => `catalog: ${issue}`));
    } else {
      issues.push(`catalog could not be validated: ${error.message}`);
    }
  }

  if (![...fileMap.entries()].some(([name, text]) => name.startsWith('scripts/') && text.includes('https://api.unifyport.ai'))) {
    issues.push('runtime scripts must pin the public API origin https://api.unifyport.ai');
  }

  if (issues.length > 0) {
    throw new BundleValidationError([...new Set(issues)]);
  }

  return {
    root: absoluteRoot,
    fileCount: files.length,
    totalBytes,
  };
}

export const BUNDLE_LIMIT_BYTES = MAX_BUNDLE_BYTES;
