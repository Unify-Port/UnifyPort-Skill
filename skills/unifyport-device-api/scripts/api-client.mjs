#!/usr/bin/env node

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_ORIGIN = 'https://api.unifyport.ai';
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_REQUEST_BYTES = 256 * 1024;
export const MAX_RESPONSE_BYTES = 1024 * 1024;

const CATALOG_PATH = fileURLToPath(new URL('../references/operations.json', import.meta.url));
const CONFIRMATION_DOMAIN = 'unifyport-device-api-confirmation-v1\0';
const CONFIRMATION_TTL_SECONDS = 5 * 60;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);
const ALLOWED_RISKS = new Set(['read', 'write', 'credential', 'destructive']);
const ALLOWED_CONFIRMATION_MODES = new Set(['none', 'hmac-sha256']);
const TRUSTED_DOCS_ORIGIN = 'https://www.unifyport.ai';
const RESERVED_PATH_SEGMENTS = new Set(['internal']);
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
// 公开请求不能把平台维护的状态或未文档化的顶层 proxy 当作可写字段。
const FORBIDDEN_PUBLIC_BODY_FIELDS = new Set(['auth_status', 'runtime_status', 'proxy']);
// 共享 messages 路由必须按公开 action 分离，避免一个 action 借用另一个 action 的扩展字段。
const EXACT_OPERATION_FIELDS = Object.freeze({
  'create-account': {
    bodyFields: ['name', 'provider', 'region', 'status', 'auth_mode', 'capabilities', 'metadata', 'provider_account_ref', 'provider_data'],
  },
  'update-account': {
    bodyFields: ['name', 'provider', 'region', 'status', 'auth_mode', 'capabilities', 'metadata', 'provider_data'],
  },
  'send-text-message': { bodyFields: ['account_id', 'to', 'message', 'provider_data'] },
  'send-media-message': { bodyFields: ['account_id', 'to', 'message'] },
  'send-contact-message': { bodyFields: ['account_id', 'to', 'message'] },
  'send-reply-message': { bodyFields: ['account_id', 'to', 'message', 'reply_to'] },
  'send-mention-message': { bodyFields: ['account_id', 'to', 'message', 'mentions'] },
  'list-conversations': { queryFields: ['type', 'cursor', 'limit'] },
});
const GLOBAL_SENSITIVE_KEYS = new Set([
  'id',
  'workspaceid',
  'accountid',
  'contactid',
  'conversationid',
  'chatid',
  'messageid',
  'senderid',
  'recipientid',
  'memberid',
  'memberids',
  'endpointid',
  'keyid',
  'apikey',
  'key',
  'secret',
  'signingsecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'password',
  'session',
  'sessionurl',
  'authorization',
  'cookie',
  'phone',
  'phonenumber',
  'email',
  'jid',
  'name',
  'username',
  'text',
  'content',
  'caption',
  'note',
  'metadata',
  'providerdata',
  'authpayload',
  'qr',
  'code',
  'url',
  'replytoken',
]);

const normalizeKey = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const isForbiddenCredentialField = (normalizedKey) => {
  const includesEvery = (parts) => parts.every((part) => normalizedKey.includes(part));
  return (
    includesEvery(['access', 'key', 'secret']) ||
    includesEvery(['security', 'token']) ||
    includesEvery(['temporary', 'credential']) ||
    (normalizedKey.startsWith('sts') && normalizedKey.includes('token'))
  );
};

const containsReservedPathSegment = (value) => String(value).split(/[\\/]/).some((rawSegment) => {
  let segment = rawSegment.split(/[?#]/, 1)[0];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = decodeURIComponent(segment);
      if (decoded === segment) break;
      segment = decoded;
    } catch {
      break;
    }
  }
  return RESERVED_PATH_SEGMENTS.has(segment.toLowerCase());
});

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const assertStringArray = (value, label) => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid catalog ${label}`);
  }
};

const validateDocsUrl = (value, locale) => {
  const url = new URL(value);
  const prefix = locale === 'zhCN' ? '/zh-CN/docs/' : '/docs/';
  if (url.origin !== TRUSTED_DOCS_ORIGIN || !url.pathname.startsWith(prefix) || url.search || url.hash) {
    throw new Error(`Invalid catalog docs.${locale}`);
  }
};

const validateCatalog = (value) => {
  if (!isPlainObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.operations)) {
    throw new Error('Invalid operation catalog');
  }

  const expectedCount = value.counts?.documentedActions;
  if (expectedCount !== 68 || value.counts?.uniqueRoutes !== 64 || value.operations.length !== expectedCount) {
    throw new Error('Operation catalog coverage mismatch');
  }

  const ids = new Set();
  const routes = new Set();
  const methods = { GET: 0, POST: 0, PATCH: 0, DELETE: 0 };

  for (const operation of value.operations) {
    if (!isPlainObject(operation) || typeof operation.id !== 'string' || ids.has(operation.id)) {
      throw new Error('Invalid or duplicate catalog operation id');
    }
    ids.add(operation.id);

    if (!ALLOWED_METHODS.has(operation.method) || typeof operation.path !== 'string') {
      throw new Error(`Invalid catalog route for ${operation.id}`);
    }
    if (
      !operation.path.startsWith('/v1/') ||
      containsReservedPathSegment(operation.path) ||
      operation.path.includes('..') ||
      /[?#\\]/.test(operation.path)
    ) {
      throw new Error(`Forbidden catalog path for ${operation.id}`);
    }

    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(operation.operationId)) {
      throw new Error(`Invalid operationId for ${operation.id}`);
    }
    if (!isPlainObject(operation.title) || !operation.title.en || !operation.title.zhCN) {
      throw new Error(`Missing bilingual title for ${operation.id}`);
    }
    validateDocsUrl(operation.docs?.en, 'en');
    validateDocsUrl(operation.docs?.zhCN, 'zhCN');

    for (const fieldName of ['pathParams', 'queryFields', 'bodyFields', 'sensitiveFields']) {
      assertStringArray(operation[fieldName], `${operation.id}.${fieldName}`);
    }
    for (const field of operation.bodyFields) {
      if (FORBIDDEN_PUBLIC_BODY_FIELDS.has(field)) {
        throw new Error(`Forbidden catalog body field for ${operation.id}`);
      }
    }
    for (const [fieldName, exactFields] of Object.entries(EXACT_OPERATION_FIELDS[operation.id] ?? {})) {
      if (JSON.stringify(operation[fieldName]) !== JSON.stringify(exactFields)) {
        throw new Error(`Public request field mismatch for ${operation.id}.${fieldName}`);
      }
    }
    for (const field of [...operation.pathParams, ...operation.queryFields, ...operation.bodyFields]) {
      if (isForbiddenCredentialField(normalizeKey(field))) {
        throw new Error(`Forbidden catalog field for ${operation.id}`);
      }
    }

    const placeholders = [...operation.path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
    if (JSON.stringify(placeholders) !== JSON.stringify([...operation.pathParams].sort())) {
      throw new Error(`Path parameter mismatch for ${operation.id}`);
    }

    if (!ALLOWED_RISKS.has(operation.risk) || !isPlainObject(operation.confirmation)) {
      throw new Error(`Invalid risk metadata for ${operation.id}`);
    }
    if (!ALLOWED_CONFIRMATION_MODES.has(operation.confirmation.mode)) {
      throw new Error(`Invalid confirmation mode for ${operation.id}`);
    }
    const expectedConfirmation = {
      read: { mode: 'none', optIn: null },
      write: { mode: 'hmac-sha256', optIn: null },
      credential: { mode: 'hmac-sha256', optIn: 'credential' },
      destructive: { mode: 'hmac-sha256', optIn: 'destructive' },
    }[operation.risk];
    if (
      operation.confirmation.mode !== expectedConfirmation.mode ||
      operation.confirmation.optIn !== expectedConfirmation.optIn ||
      (operation.risk === 'read' && operation.method !== 'GET') ||
      (operation.risk === 'write' && operation.method === 'GET') ||
      (operation.risk === 'destructive' && operation.method === 'GET') ||
      (operation.method === 'DELETE' && operation.risk !== 'destructive')
    ) {
      throw new Error(`Risk and confirmation mismatch for ${operation.id}`);
    }

    methods[operation.method] += 1;
    routes.add(`${operation.method} ${operation.path}`);
  }

  if (routes.size !== value.counts.uniqueRoutes) throw new Error('Unique route count mismatch');
  for (const method of Object.keys(methods)) {
    if (methods[method] !== value.counts.methods?.[method]) throw new Error(`${method} count mismatch`);
  }

  return value;
};

// catalog 在加载时 fail closed，避免发布包被意外混入内部路由或临时凭证字段。
export const catalog = validateCatalog(JSON.parse(readFileSync(CATALOG_PATH, 'utf8')));
const operationsById = new Map(catalog.operations.map((operation) => [operation.id, operation]));

export const getOperation = (id) => {
  const operation = operationsById.get(id);
  if (!operation) throw new Error(`Unknown operation id: ${id}`);
  return operation;
};

const isBlockedIpv4 = (hostname) => {
  const [a, b, c] = hostname.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 175 && c === 48) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
};

const isBlockedIpv6 = (hostname) => {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('::ffff:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^(?:fe[89ab])/.test(normalized) ||
    normalized.startsWith('fec') ||
    normalized === '2001:db8' ||
    normalized.startsWith('2001:db8:') ||
    normalized.startsWith('2001:2:') ||
    normalized.startsWith('2001:10:') ||
    normalized.startsWith('ff')
  );
};

const assertPublicHost = (value, path) => {
  if (typeof value !== 'string' || value.length === 0 || /[\x00-\x20/\\@]/.test(value)) {
    throw new Error(`${path} must be a public host`);
  }
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const blockedLabels = new Set(['localhost', 'local', 'internal', 'intranet', 'staging', 'stage', 'dev', 'development']);
  const labels = hostname.split('.');
  const ipVersion = isIP(hostname);
  const looksNumeric = labels.every((label) => /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(label));
  if (
    (!ipVersion && looksNumeric) ||
    (!ipVersion && labels.length < 2) ||
    labels.some((label) => blockedLabels.has(label)) ||
    (ipVersion === 4 && isBlockedIpv4(hostname)) ||
    (ipVersion === 6 && isBlockedIpv6(hostname))
  ) {
    throw new Error(`${path} must be a public host`);
  }
};

const assertPublicHttpsUrl = (value, path) => {
  if (typeof value !== 'string') throw new Error(`${path} must be an absolute HTTPS URL`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${path} must be an absolute HTTPS URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error(`${path} must use a public HTTPS origin`);
  }
  assertPublicHost(url.hostname, path);
};

const assertProxyConfig = (value, path) => {
  let config = value;
  if (typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch {
      throw new Error(`${path} must be a JSON object or encoded JSON object`);
    }
  }
  if (!isPlainObject(config)) throw new Error(`${path} must be a JSON object or encoded JSON object`);

  const allowedKeys = new Set(['host', 'port', 'proxy_type', 'type', 'username', 'user', 'password']);
  for (const key of Object.keys(config)) {
    if (!allowedKeys.has(key)) throw new Error(`Unknown proxy field at ${path}.${key}`);
  }
  assertPublicHost(config.host, `${path}.host`);
  if (config.port !== undefined && (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)) {
    throw new Error(`${path}.port must be an integer from 1 to 65535`);
  }
  const proxyType = config.proxy_type ?? config.type;
  if (proxyType !== undefined && !['http', 'https', 'socks5'].includes(proxyType)) {
    throw new Error(`${path} has an unsupported proxy type`);
  }
};

const assertInputTree = (value, path = '$', depth = 0) => {
  if (depth > 32) throw new Error('Request input is too deeply nested');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid number at ${path}`);
    if (typeof value === 'string' && containsReservedPathSegment(value)) {
      throw new Error(`Forbidden reserved path segment at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertInputTree(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isPlainObject(value)) throw new Error(`Invalid JSON value at ${path}`);

  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (FORBIDDEN_OBJECT_KEYS.has(key) || isForbiddenCredentialField(normalizedKey)) {
      throw new Error(`Forbidden request field at ${path}.${key}`);
    }
    if (normalizedKey === 'proxy' || normalizedKey === 'proxyconfig') {
      assertProxyConfig(item, `${path}.${key}`);
    } else if (normalizedKey === 'url' || normalizedKey.endsWith('url')) {
      assertPublicHttpsUrl(item, `${path}.${key}`);
    }
    assertInputTree(item, `${path}.${key}`, depth + 1);
  }
};

const assertAllowedFields = (value, allowedFields, label) => {
  if (!isPlainObject(value)) throw new Error(`${label} must be a JSON object`);
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown ${label} field: ${key}`);
  }
};

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const normalizeInput = (operation, input) => {
  if (!isPlainObject(input)) throw new Error('Input must be a JSON object');
  const inputKeys = Object.keys(input);
  if (inputKeys.some((key) => !['params', 'query', 'body'].includes(key))) {
    throw new Error('Input only accepts params, query, and body');
  }

  const params = input.params ?? {};
  const query = input.query ?? {};
  const body = input.body ?? {};
  const hasBody = Object.prototype.hasOwnProperty.call(input, 'body');
  if (operation.method === 'GET' && hasBody) throw new Error('GET operations do not accept a body');

  assertAllowedFields(params, operation.pathParams, 'params');
  assertAllowedFields(query, operation.queryFields, 'query');
  assertAllowedFields(body, operation.bodyFields, 'body');
  assertInputTree(params, '$.params');
  assertInputTree(query, '$.query');
  assertInputTree(body, '$.body');

  let pathname = operation.path;
  for (const name of operation.pathParams) {
    const value = params[name];
    if (!['string', 'number'].includes(typeof value)) {
      throw new Error(`Missing or invalid path parameter: ${name}`);
    }
    const text = String(value);
    if (
      text.length === 0 ||
      text.length > 512 ||
      /[\x00-\x1f\x7f/\\]/.test(text) ||
      text === '.' ||
      text === '..'
    ) {
      throw new Error(`Missing or invalid path parameter: ${name}`);
    }
    pathname = pathname.replace(`{${name}}`, encodeURIComponent(text));
  }
  if (pathname.includes('{') || pathname.includes('}')) throw new Error('Unresolved path parameter');

  const url = new URL(pathname, API_ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (!['string', 'number', 'boolean'].includes(typeof item)) {
        throw new Error(`Invalid query value: ${key}`);
      }
      url.searchParams.append(key, String(item));
    }
  }
  if (url.origin !== API_ORIGIN || url.href.length > 8192) throw new Error('Resolved request URL is invalid');

  let serializedBody;
  if (hasBody) {
    serializedBody = JSON.stringify(body);
    if (Buffer.byteLength(serializedBody) > MAX_REQUEST_BYTES) throw new Error('Request body exceeds size limit');
  }

  const canonical = stableStringify({
    schemaVersion: catalog.schemaVersion,
    id: operation.id,
    method: operation.method,
    pathname: url.pathname,
    query: [...url.searchParams.entries()].sort(([keyA, valueA], [keyB, valueB]) =>
      keyA.localeCompare(keyB) || valueA.localeCompare(valueB)),
    body: hasBody ? body : null,
  });

  return { operation, params, query, body, hasBody, url, serializedBody, canonical };
};

export const prepareOperation = (id, input = {}) => normalizeInput(getOperation(id), input);

const scrubString = (value, secrets) => {
  let result = value;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join('[REDACTED]');
  }
  return result
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[REDACTED_PHONE]')
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/g, '[REDACTED_TOKEN]');
};

export const redactSensitive = (value, sensitiveFields = [], secrets = [], depth = 0) => {
  if (depth > 32) return '[REDACTED_DEPTH_LIMIT]';
  if (typeof value === 'string') return scrubString(value, secrets);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, sensitiveFields, secrets, depth + 1));
  }

  const sensitive = new Set([...GLOBAL_SENSITIVE_KEYS, ...sensitiveFields.map(normalizeKey)]);
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey === 'requestid' && typeof item === 'string') {
      result[key] = secrets.reduce((current, secret) => secret ? current.split(secret).join('[REDACTED]') : current, item);
      continue;
    }
    result[key] = sensitive.has(normalizedKey)
      ? '[REDACTED]'
      : redactSensitive(item, [...sensitive], secrets, depth + 1);
  }
  return result;
};

const getApiKey = (env) => {
  const apiKey = env?.UNIFYPORT_API_KEY;
  if (
    typeof apiKey !== 'string' ||
    apiKey.length === 0 ||
    apiKey.length > 4096 ||
    /[\x00-\x20\x7f]/.test(apiKey)
  ) {
    throw new Error('UNIFYPORT_API_KEY environment variable is required');
  }
  return apiKey;
};

const confirmationMac = (prepared, apiKey, expiresAt) => createHmac('sha256', apiKey)
  .update(CONFIRMATION_DOMAIN)
  .update(String(expiresAt))
  .update('\0')
  .update(prepared.canonical)
  .digest('hex');

export const createConfirmationToken = (prepared, env = process.env, nowMs = Date.now()) => {
  const apiKey = getApiKey(env);
  const expiresAt = Math.floor(nowMs / 1000) + CONFIRMATION_TTL_SECONDS;
  return `${expiresAt}.${confirmationMac(prepared, apiKey, expiresAt)}`;
};

const verifyConfirmationToken = (actual, prepared, apiKey, nowMs) => {
  const match = /^(\d{10,12})\.([a-f0-9]{64})$/.exec(actual ?? '');
  if (!match) return 'confirmation_mismatch';
  const expiresAt = Number(match[1]);
  const now = Math.floor(nowMs / 1000);
  if (expiresAt < now) return 'confirmation_expired';
  if (expiresAt > now + CONFIRMATION_TTL_SECONDS) return 'confirmation_expiry_invalid';
  const expected = confirmationMac(prepared, apiKey, expiresAt);
  return timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(expected, 'hex'))
    ? null
    : 'confirmation_mismatch';
};

const buildPreview = (prepared, token) => ({
  operation: prepared.operation.id,
  method: prepared.operation.method,
  path: prepared.operation.path,
  risk: prepared.operation.risk,
  params: redactSensitive(prepared.params, prepared.operation.sensitiveFields),
  query: redactSensitive(prepared.query, prepared.operation.sensitiveFields),
  body: prepared.hasBody
    ? redactSensitive(prepared.body, prepared.operation.sensitiveFields)
    : null,
  confirmation: {
    mode: 'hmac-sha256',
    token,
    expiresAt: new Date(Number(token.split('.', 1)[0]) * 1000).toISOString(),
  },
});

const readResponseBytes = async (response) => {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('Response exceeds size limit');
  }
  if (!response.body) return Buffer.alloc(0);

  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Response exceeds size limit');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
};

const parseResponse = (bytes, response, sensitiveFields, apiKey) => {
  if (bytes.length === 0) return null;
  const text = bytes.toString('utf8');
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    return { redacted: true, byteLength: bytes.length, mediaType: contentType || 'unknown' };
  }
  try {
    return redactSensitive(JSON.parse(text), sensitiveFields, [apiKey]);
  } catch {
    return { redacted: true, byteLength: bytes.length, mediaType: contentType };
  }
};

// HMAC 令牌把确认绑定到完整请求，同时避免低熵 code/password 形成可离线爆破的裸哈希。
export const runOperation = async (id, input = {}, options = {}) => {
  const prepared = prepareOperation(id, input);
  const operation = prepared.operation;
  const apiKey = getApiKey(options.env ?? process.env);
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('Invalid current time');
  let preview;

  if (operation.confirmation.mode === 'hmac-sha256') {
    const token = createConfirmationToken(prepared, options.env ?? process.env, nowMs);
    preview = buildPreview(prepared, token);

    if (operation.confirmation.optIn === 'credential' && options.allowCredential !== true) {
      return { executed: false, reason: 'credential_opt_in_required', requiredFlag: '--allow-credential', preview };
    }
    if (operation.confirmation.optIn === 'destructive' && options.allowDestructive !== true) {
      return { executed: false, reason: 'destructive_opt_in_required', requiredFlag: '--allow-destructive', preview };
    }
    if (!options.confirm) return { executed: false, reason: 'confirmation_required', preview };
    const confirmationFailure = verifyConfirmationToken(options.confirm, prepared, apiKey, nowMs);
    if (confirmationFailure) return { executed: false, reason: confirmationFailure, preview };
  }

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > REQUEST_TIMEOUT_MS) {
    throw new Error('Invalid request timeout');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);

  try {
    const headers = {
      Accept: 'application/json',
      'X-Api-Key': apiKey,
      'User-Agent': 'unifyport-device-api-skill/1',
    };
    if (prepared.hasBody) headers['Content-Type'] = 'application/json';

    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('Fetch API is unavailable');
    const response = await fetchImpl(prepared.url, {
      method: operation.method,
      headers,
      body: prepared.serializedBody,
      redirect: 'manual',
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('Redirect responses are not allowed');
    }

    const bytes = await readResponseBytes(response);
    return {
      executed: true,
      ok: response.ok,
      status: response.status,
      data: parseResponse(bytes, response, operation.sensitiveFields, apiKey),
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Request timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const parseJsonArgument = (value, label) => {
  if (Buffer.byteLength(value) > MAX_REQUEST_BYTES) throw new Error(`${label} exceeds size limit`);
  try {
    const parsed = JSON.parse(value);
    if (!isPlainObject(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} must be a valid JSON object`);
  }
};

const readObjectFromStdin = async (stdin = process.stdin, label = 'stdin input') => {
  const chunks = [];
  let total = 0;
  for await (const chunk of stdin) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_REQUEST_BYTES) throw new Error(`${label} exceeds size limit`);
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks, total).toString('utf8').trim();
  if (!text) throw new Error(`${label} requires a JSON object on stdin`);
  return parseJsonArgument(text, label);
};

const usage = () => `Usage:
  node api-client.mjs list
  node api-client.mjs describe <id>
  node api-client.mjs call <id> [--input-stdin | [--params JSON] [--query JSON] [--body JSON | --body-stdin]]
                              [--confirm TOKEN] [--allow-credential] [--allow-destructive]

UNIFYPORT_API_KEY is read only from the environment. Sensitive request fields require --input-stdin.`;

export const parseCallFlags = (args) => {
  const result = { input: {}, options: {}, bodySource: null, inputSource: 'flags' };
  const seen = new Set();
  let hasRequestFlag = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);

    if (['--params', '--query', '--body', '--confirm'].includes(flag)) {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`Missing value for ${flag}`);
      index += 1;
      if (flag === '--confirm') result.options.confirm = value;
      else {
        if (result.inputSource === 'stdin') {
          throw new Error('--input-stdin is mutually exclusive with request field options');
        }
        hasRequestFlag = true;
        const field = flag.slice(2);
        if (flag === '--body' && result.bodySource !== null) {
          throw new Error('--body and --body-stdin are mutually exclusive');
        }
        result.input[field] = parseJsonArgument(value, field);
        if (flag === '--body') result.bodySource = 'inline';
      }
    } else if (flag === '--body-stdin') {
      if (result.inputSource === 'stdin') {
        throw new Error('--input-stdin is mutually exclusive with request field options');
      }
      hasRequestFlag = true;
      if (result.bodySource !== null) throw new Error('--body and --body-stdin are mutually exclusive');
      result.bodySource = 'stdin';
    } else if (flag === '--input-stdin') {
      if (hasRequestFlag) throw new Error('--input-stdin is mutually exclusive with request field options');
      result.inputSource = 'stdin';
    } else if (flag === '--allow-credential') {
      result.options.allowCredential = true;
    } else if (flag === '--allow-destructive') {
      result.options.allowDestructive = true;
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  if (result.bodySource === 'stdin' && Object.prototype.hasOwnProperty.call(result.input, 'body')) {
    throw new Error('--body and --body-stdin are mutually exclusive');
  }
  return result;
};

const containsSensitiveInputField = (value, sensitiveFields = []) => {
  if (Array.isArray(value)) return value.some((item) => containsSensitiveInputField(item, sensitiveFields));
  if (!isPlainObject(value)) return false;
  const sensitive = new Set([...GLOBAL_SENSITIVE_KEYS, ...sensitiveFields.map(normalizeKey)]);
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (
      sensitive.has(normalized) ||
      normalized === 'code' ||
      normalized === 'pin' ||
      normalized === 'password' ||
      normalized === 'apikey' ||
      normalized === 'apihash' ||
      normalized.startsWith('phone') ||
      normalized.includes('session') ||
      normalized.includes('cookie') ||
      normalized.includes('proxy') ||
      normalized.endsWith('token') ||
      normalized.endsWith('secret')
    ) {
      return true;
    }
    if (containsSensitiveInputField(item, sensitiveFields)) return true;
  }
  return false;
};

export const enforceInputTransport = (operation, parsed) => {
  if (parsed.inputSource === 'stdin') return;
  if (containsSensitiveInputField(parsed.input, operation.sensitiveFields)) {
    throw new Error('Sensitive request fields require --input-stdin');
  }
};

export const main = async (argv = process.argv.slice(2), io = {}) => {
  const stdout = io.stdout ?? process.stdout;
  const stdin = io.stdin ?? process.stdin;
  const env = io.env ?? process.env;
  const [command, id, ...args] = argv;
  if (!command || command === '--help' || command === '-h') {
    stdout.write(`${usage()}\n`);
    return;
  }

  if (command === 'list') {
    if (id !== undefined) throw new Error('list does not accept arguments');
    const output = catalog.operations.map(({ id: operationId, title, method, path, risk }) => ({
      id: operationId,
      title,
      method,
      path,
      risk,
    }));
    stdout.write(`${JSON.stringify({ count: output.length, operations: output }, null, 2)}\n`);
    return;
  }

  if (command === 'describe') {
    if (!id || args.length > 0) throw new Error('describe requires exactly one operation id');
    stdout.write(`${JSON.stringify(getOperation(id), null, 2)}\n`);
    return;
  }

  if (command !== 'call' || !id) throw new Error(usage());
  const operation = getOperation(id);
  const parsed = parseCallFlags(args);
  if (parsed.inputSource === 'stdin') {
    parsed.input = await readObjectFromStdin(stdin, '--input-stdin');
  } else if (parsed.bodySource === 'stdin') {
    parsed.input.body = await readObjectFromStdin(stdin, '--body-stdin');
  }
  enforceInputTransport(operation, parsed);

  const result = await runOperation(id, parsed.input, { ...parsed.options, env });
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exitCode = 1;
  });
}
