import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { BundleValidationError, validateBundle } from '../scripts/lib/bundle-validation.mjs';
import { PUBLIC_CONTRACT } from '../scripts/lib/catalog-validation.mjs';
import { RepositoryValidationError, validateRepository } from '../scripts/lib/repository-validation.mjs';

// 每个测试使用隔离临时目录，确保恶意夹具不会进入真实候选 bundle。
function createOperation({ id, method, path: route, risk }) {
  const confirmation = {
    read: { mode: 'none', optIn: null },
    write: { mode: 'hmac-sha256', optIn: null },
    credential: { mode: 'hmac-sha256', optIn: 'credential' },
    destructive: { mode: 'hmac-sha256', optIn: 'destructive' },
  }[risk];
  return {
    id,
    operationId: id.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase()),
    category: 'Synthetic',
    title: { en: `Synthetic ${id}`, zhCN: `合成 ${id}` },
    method,
    path: route,
    docs: {
      en: `https://www.unifyport.ai/docs/synthetic/${id}/`,
      zhCN: `https://www.unifyport.ai/zh-CN/docs/synthetic/${id}/`,
    },
    pathParams: [...route.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]),
    queryFields: [],
    bodyFields: method === 'GET' ? [] : ['value'],
    risk,
    sensitiveFields: ['id'],
    confirmation,
  };
}

function createCatalogs() {
  const operations = Object.entries(PUBLIC_CONTRACT.operations).map(([id, value]) => createOperation({
    id,
    method: value.method,
    path: value.path,
    risk: value.method === 'GET' ? 'read' : value.method === 'DELETE' ? 'destructive' : 'write',
  }));

  const source = {
    publicDocs: {
      en: 'https://www.unifyport.ai/docs/',
      zhCN: 'https://www.unifyport.ai/zh-CN/docs/',
    },
    scope: 'Synthetic public fixture',
    retrievedAt: '2026-07-20',
  };
  const operationCatalog = {
    schemaVersion: 1,
    source,
    counts: { documentedActions: 82, uniqueRoutes: 78, methods: { GET: 23, POST: 53, PATCH: 4, DELETE: 2 } },
    operations,
  };
  const eventCatalog = {
    schemaVersion: 1,
    source: {
      ...source,
      publicDocs: {
        en: 'https://www.unifyport.ai/docs/receiving-events/webhook-events/',
        zhCN: 'https://www.unifyport.ai/zh-CN/docs/receiving-events/webhook-events/',
      },
    },
    counts: { events: 24 },
    events: PUBLIC_CONTRACT.events.map((type, index) => ({
      type,
      description: { en: `Synthetic event ${index}`, zhCN: `合成事件 ${index}` },
      docs: {
        en: `https://www.unifyport.ai/docs/receiving-events/event-${type.replaceAll('.', '-')}/`,
        zhCN: `https://www.unifyport.ai/zh-CN/docs/receiving-events/event-${type.replaceAll('.', '-')}/`,
      },
      risk: 'read',
      sensitiveFields: ['id'],
      confirmation: { mode: 'none', optIn: null },
    })),
  };
  return { operationCatalog, eventCatalog };
}

async function createValidBundle(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unifyport-skill-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'references/en'), { recursive: true });
  await mkdir(path.join(root, 'references/zh-CN'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });

  const skillEn = `---
name: unifyport-device-api
description: Safely inspect and call the documented public UnifyPort Device API.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: [node]
    primaryEnv: UNIFYPORT_API_KEY
    envVars:
      - name: UNIFYPORT_API_KEY
        required: false
    homepage: https://www.unifyport.ai/docs/
---
# UnifyPort Device API

## Usage

[Overview](references/en/overview.md)

\`\`\`bash
node scripts/client.mjs --help
\`\`\`
`;
  const skillZh = `# UnifyPort Device API

## 使用方式

[概览](references/zh-CN/overview.md)

\`\`\`bash
node scripts/client.mjs --help
\`\`\`
`;
  const localizedReferences = {
    'overview.md': ['# Overview\n\n## Boundary\n\nUse public data only.\n', '# 概览\n\n## 边界\n\n仅使用公开数据。\n'],
    'safety.md': ['# Safety\n\n## Stop conditions\n\nFail closed.\n', '# 安全\n\n## 停止条件\n\n默认拒绝。\n'],
    'workflows.md': ['# Workflows\n\n## Documentation\n\nExplain first.\n', '# 工作流\n\n## 文档\n\n先解释。\n'],
    'guides.md': [
      '# Guides\n\nGuide IDs: `introduction`, `quickstart`, `account-lifecycle`, `provider-auth-telegram`, `provider-auth-line`, `provider-auth-zalo`, `provider-auth-twitter`, `provider-auth-whatsapp`, `provider-auth-facebook`.\n',
      '# Guide\n\nGuide ID：`introduction`、`quickstart`、`account-lifecycle`、`provider-auth-telegram`、`provider-auth-line`、`provider-auth-zalo`、`provider-auth-twitter`、`provider-auth-whatsapp`、`provider-auth-facebook`。\n',
    ],
    'provider-capabilities.md': [
      '# Provider capabilities\n\nGuide IDs: `provider-message-support`, `provider-actions-support`, `provider-webhook-events`. Matrix IDs: `message-sending`, `actions`, `webhook-events`.\n\n| Capability | Telegram | WhatsApp | X | LINE | Zalo |\n| --- | --- | --- | --- | --- | --- |\n| Action | Telegram | WhatsApp | X | LINE | Zalo |\n| --- | --- | --- | --- | --- | --- |\n| Event | Telegram | WhatsApp | X | LINE | Zalo |\n| --- | --- | --- | --- | --- | --- |\n',
      '# Provider 能力\n\nGuide ID：`provider-message-support`、`provider-actions-support`、`provider-webhook-events`。Matrix ID：`message-sending`、`actions`、`webhook-events`。\n\n| Capability | Telegram | WhatsApp | X | LINE | Zalo |\n| --- | --- | --- | --- | --- | --- |\n| Action | Telegram | WhatsApp | X | LINE | Zalo |\n| --- | --- | --- | --- | --- | --- |\n| Event | Telegram | WhatsApp | X | LINE | Zalo |\n| --- | --- | --- | --- | --- | --- |\n',
    ],
    'webhooks.md': [
      '# Webhooks\n\nGuide IDs: `webhook-delivery`, `webhook-events`.\n\n## Delivery\n\n`X-Device-Event-Id` `X-Device-Delivery-Id` `X-Device-Timestamp` `X-Device-Signature` HMAC-SHA256 `<timestamp>.<raw-body>` `2xx` `408` `429` `5xx`.\n',
      '# Webhook\n\nGuide ID：`webhook-delivery`、`webhook-events`。\n\n## 投递\n\n`X-Device-Event-Id` `X-Device-Delivery-Id` `X-Device-Timestamp` `X-Device-Signature` HMAC-SHA256 `<timestamp>.<raw-body>` `2xx` `408` `429` `5xx`。\n',
    ],
    'errors.md': [
      '# Errors\n\nGuide ID: `error-reference`.\n\nHTTP Groups: `400`, `401`, `404`, `409`, `500`, `501`, `502`, `503`.\n',
      '# 错误\n\nGuide ID：`error-reference`。\n\nHTTP Groups：`400`、`401`、`404`、`409`、`500`、`501`、`502`、`503`。\n',
    ],
  };
  const { operationCatalog, eventCatalog } = createCatalogs();

  const writes = [
    writeFile(path.join(root, 'SKILL.md'), skillEn, 'utf8'),
    writeFile(path.join(root, 'SKILL.zh-CN.md'), skillZh, 'utf8'),
    writeFile(path.join(root, 'references/operations.json'), `${JSON.stringify(operationCatalog, null, 2)}\n`, 'utf8'),
    writeFile(path.join(root, 'references/events.json'), `${JSON.stringify(eventCatalog, null, 2)}\n`, 'utf8'),
    writeFile(path.join(root, 'scripts/client.mjs'), "const API_ORIGIN = 'https://api.unifyport.ai';\nconst apiKey = process.env.UNIFYPORT_API_KEY;\nconsole.log(API_ORIGIN, Boolean(apiKey));\n", 'utf8'),
  ];
  for (const [fileName, [en, zhCN]] of Object.entries(localizedReferences)) {
    writes.push(writeFile(path.join(root, 'references/en', fileName), en, 'utf8'));
    writes.push(writeFile(path.join(root, 'references/zh-CN', fileName), zhCN, 'utf8'));
  }
  await Promise.all(writes);
  return root;
}

test('accepts an exact self-contained bilingual publish bundle', async (t) => {
  const root = await createValidBundle(t);
  const result = await validateBundle(root);
  assert.equal(result.fileCount, 19);
  assert.ok(result.totalBytes > 0);
});

test('allows only the root .clawhubignore as a second defense', async (t) => {
  const root = await createValidBundle(t);
  await writeFile(path.join(root, '.clawhubignore'), '*.map\n.env*\n', 'utf8');
  const result = await validateBundle(root);
  assert.equal(result.fileCount, 20);
});

test('rejects files outside the exact publish allowlist', async (t) => {
  const root = await createValidBundle(t);
  await writeFile(path.join(root, 'README.md'), '# Unexpected\n', 'utf8');

  await assert.rejects(
    validateBundle(root),
    (error) => error instanceof BundleValidationError && error.issues.some((issue) => issue.includes('outside the exact publish allowlist')),
  );
});

test('rejects symbolic links even when their names are allowed', async (t) => {
  const root = await createValidBundle(t);
  await symlink(path.join(root, 'scripts/client.mjs'), path.join(root, 'scripts/linked.mjs'));

  await assert.rejects(
    validateBundle(root),
    (error) => error instanceof BundleValidationError && error.issues.some((issue) => issue.includes('symbolic links are forbidden')),
  );
});

test('rejects secrets, PII, internal paths, and private hosts', async (t) => {
  const cases = [
    ['private key', ['-----BEGIN PRI', 'VATE KEY-----'].join(''), 'private key material'],
    ['email', ['person', '@', 'company.invalid'].join(''), 'email address'],
    ['phone', ['+44', ' 7700', ' 900123'].join(''), 'phone number'],
    ['internal path', ['/v1', 'internal', 'example'].join('/'), 'internal API path'],
    ['private host', ['https://', 'staging', '.example.com/path'].join(''), 'private or pre-production host'],
    ['assigned credential', ['"api', '_key": "live', '_secret_value_1234567890"'].join(''), 'assigned credential'],
  ];

  for (const [name, content, expected] of cases) {
    await t.test(name, async (subtest) => {
      const root = await createValidBundle(subtest);
      await writeFile(path.join(root, 'references/en/overview.md'), `# Overview\n\n## Safety\n\n${content}\n`, 'utf8');
      await assert.rejects(
        validateBundle(root),
        (error) => error instanceof BundleValidationError && error.issues.some((issue) => issue.includes(expected)),
      );
    });
  }
});

test('rejects external runtime dependencies and undeclared environment reads', async (t) => {
  const root = await createValidBundle(t);
  const externalSpecifier = ['external', 'package'].join('-');
  const importPrefix = ['im', 'port helper fr', 'om '].join('');
  const quote = "'";
  const source = [
    importPrefix,
    quote,
    externalSpecifier,
    quote,
    ';\nconst origin = ',
    quote,
    'https://api.unifyport.ai',
    quote,
    ';\nconsole.log(helper, origin, process.env.EXTRA_TOKEN);\n',
  ].join('');
  await writeFile(
    path.join(root, 'scripts/client.mjs'),
    source,
    'utf8',
  );

  await assert.rejects(
    validateBundle(root),
    (error) => error instanceof BundleValidationError
      && error.issues.some((issue) => issue.includes('imports external package'))
      && error.issues.some((issue) => issue.includes('undeclared environment variable')),
  );
});

test('rejects frontmatter that makes the API key mandatory', async (t) => {
  const root = await createValidBundle(t);
  const file = path.join(root, 'SKILL.md');
  const invalid = (await readFile(file, 'utf8')).replace('required: false', 'required: true');
  await writeFile(file, invalid, 'utf8');

  await assert.rejects(
    validateBundle(root),
    (error) => error instanceof BundleValidationError && error.issues.some((issue) => issue.includes('required must be false')),
  );
});

test('rejects bilingual structural drift', async (t) => {
  const root = await createValidBundle(t);
  await writeFile(path.join(root, 'SKILL.zh-CN.md'), '# UnifyPort Device API\n', 'utf8');

  await assert.rejects(
    validateBundle(root),
    (error) => error instanceof BundleValidationError && error.issues.some((issue) => issue.includes('heading levels must match')),
  );
});

test('rejects missing public guide, provider matrix, webhook, or error coverage markers', async (t) => {
  const root = await createValidBundle(t);
  const file = path.join(root, 'references/zh-CN/guides.md');
  const content = (await readFile(file, 'utf8')).replace('`provider-auth-line`、', '');
  await writeFile(file, content, 'utf8');

  await assert.rejects(
    validateBundle(root),
    (error) => error instanceof BundleValidationError && error.issues.some((issue) => issue.includes('provider-auth-line')),
  );
});

test('rejects a candidate over the configured size limit', async (t) => {
  const root = await createValidBundle(t);
  await assert.rejects(
    validateBundle(root, { maxBundleBytes: 64 }),
    (error) => error instanceof BundleValidationError && error.issues.some((issue) => issue.includes('exceeds limit')),
  );
});

test('repository scan covers untracked UTF-8 files but excludes Git metadata', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unifyport-repository-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '.git'), { recursive: true });
  await writeFile(path.join(root, 'README.md'), '# Public project\n', 'utf8');
  await writeFile(path.join(root, '.git/ignored'), ['person', '@', 'company.invalid'].join(''), 'utf8');

  const result = await validateRepository(root);
  assert.equal(result.fileCount, 1);
});

test('repository scan rejects a forbidden pattern assembled by a test', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unifyport-repository-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'notes.md'), ['/v1', 'internal', 'example'].join('/'), 'utf8');

  await assert.rejects(
    validateRepository(root),
    (error) => error instanceof RepositoryValidationError && error.issues.some((issue) => issue.includes('internal API path')),
  );
});
