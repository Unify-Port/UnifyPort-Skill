import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  API_ORIGIN,
  MAX_RESPONSE_BYTES,
  catalog,
  createConfirmationToken,
  enforceInputTransport,
  getOperation,
  main,
  parseCallFlags,
  prepareOperation,
  redactSensitive,
  runOperation,
} from '../skills/unifyport-device-api/scripts/api-client.mjs';

const EVENTS_PATH = fileURLToPath(new URL('../skills/unifyport-device-api/references/events.json', import.meta.url));
const VALID_ENV = { UNIFYPORT_API_KEY: 'test_api_key_value' };
const FIXED_NOW = 1_800_000_000_000;
const FIXTURE_EMAIL = ['person', 'example.net'].join('@');
const FIXTURE_PHONE = ['+1', '202', '555', '0123'].join(' ');
const LOOPBACK_IPV4 = [127, 0, 0, 1].join('.');
const PRIVATE_IPV4 = [192, 168, 1, 2].join('.');
const RESERVED_IPV4 = [192, 0, 2, 1].join('.');
const LOCALHOST = ['local', 'host'].join('');
const PREPRODUCTION_HOST = ['staging', 'example', 'com'].join('.');

// 所有网络断言都使用 mock fetch，避免验证过程触达生产 API。
const jsonResponse = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json', ...headers },
});

const invokeMain = async (argv, { input = '', env = {} } = {}) => {
  let output = '';
  const stdout = { write: (chunk) => { output += chunk; } };
  const stdin = {
    async *[Symbol.asyncIterator]() {
      if (input) yield Buffer.from(input);
    },
  };
  await main(argv, { stdout, stdin, env });
  return output;
};

test('catalogs cover exactly 82 documented actions, 78 routes, and 24 events', () => {
  assert.equal(catalog.operations.length, 82);
  assert.deepEqual(catalog.counts, {
    documentedActions: 82,
    uniqueRoutes: 78,
    methods: { GET: 23, POST: 53, PATCH: 4, DELETE: 2 },
  });
  assert.equal(new Set(catalog.operations.map(({ id }) => id)).size, 82);
  assert.equal(new Set(catalog.operations.map(({ method, path }) => `${method} ${path}`)).size, 78);
  assert.ok(catalog.operations.every(({ title, docs, bodyFields }) => (
    title.en && title.zhCN && docs.en.startsWith('https://www.unifyport.ai/docs/')
      && docs.zhCN.startsWith('https://www.unifyport.ai/zh-CN/docs/') && Array.isArray(bodyFields)
      && !bodyFields.includes('*')
  )));

  const events = JSON.parse(readFileSync(EVENTS_PATH, 'utf8'));
  assert.equal(events.counts.events, 24);
  assert.equal(events.events.length, 24);
  assert.equal(new Set(events.events.map(({ type }) => type)).size, 24);
  assert.ok(events.events.every(({ description, docs, sensitiveFields }) => (
    description.en && description.zhCN && docs.en && docs.zhCN && Array.isArray(sensitiveFields)
  )));
});

test('catalog enforces exact risk and confirmation pairs', () => {
  for (const operation of catalog.operations) {
    const expected = {
      read: { mode: 'none', optIn: null },
      write: { mode: 'hmac-sha256', optIn: null },
      credential: { mode: 'hmac-sha256', optIn: 'credential' },
      destructive: { mode: 'hmac-sha256', optIn: 'destructive' },
    }[operation.risk];
    assert.deepEqual(operation.confirmation, expected);
    if (operation.risk === 'read') assert.ok(operation.method === 'GET' || ['get-post', 'list-post-comments'].includes(operation.id));
    if (operation.risk === 'write' || operation.risk === 'destructive') assert.notEqual(operation.method, 'GET');
    if (operation.method === 'DELETE') assert.equal(operation.risk, 'destructive');
  }
});

test('selected public actions keep their exact documented request surfaces', () => {
  const expectedFields = {
    'create-account': {
      bodyFields: ['name', 'provider', 'region', 'status', 'auth_mode', 'capabilities', 'metadata', 'provider_account_ref', 'provider_data', 'runtime_status', 'proxy'],
    },
    'update-account': {
      bodyFields: ['name', 'provider', 'region', 'status', 'auth_mode', 'capabilities', 'metadata', 'provider_data', 'runtime_status', 'proxy'],
    },
    'send-text-message': { bodyFields: ['account_id', 'to', 'message', 'provider_data'] },
    'send-media-message': { bodyFields: ['account_id', 'to', 'message'] },
    'send-contact-message': { bodyFields: ['account_id', 'to', 'message'] },
    'send-reply-message': { bodyFields: ['account_id', 'to', 'message', 'reply_to'] },
    'send-mention-message': { bodyFields: ['account_id', 'to', 'message', 'mentions'] },
    'list-conversations': { queryFields: ['type', 'cursor', 'limit'] },
  };

  for (const [id, fields] of Object.entries(expectedFields)) {
    for (const [fieldName, expected] of Object.entries(fields)) {
      assert.deepEqual(getOperation(id)[fieldName], expected);
    }
  }
});

test('list and describe do not require or inspect the API key', async () => {
  for (const args of [['list'], ['describe', 'send-text-message']]) {
    const output = await invokeMain(args);
    assert.doesNotMatch(output, /UNIFYPORT_API_KEY/);
  }
});

test('unknown ids and unknown request fields fail closed', () => {
  assert.throws(() => getOperation('not-a-documented-operation'), /Unknown operation id/);
  assert.throws(
    () => prepareOperation('update-workspace', { body: { unexpected: true } }),
    /Unknown body field/,
  );
  assert.throws(
    () => prepareOperation('list-contacts', { params: { account_id: 'acc_1' }, query: { unexpected: true } }),
    /Unknown query field/,
  );
});

test('GET executes immediately against the fixed production origin and redacts output', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return jsonResponse({
      request_id: 'req_abcdefghijklmnopqrstuvwxyz123456',
      data: { id: 'contact_private', status: 'active', email: FIXTURE_EMAIL },
      echoed: VALID_ENV.UNIFYPORT_API_KEY,
    });
  };

  const result = await runOperation('get-contact', {
    params: { account_id: 'account:@one' },
    query: { contact_id: 'contact:@two' },
  }, {
    env: { ...VALID_ENV, UNIFYPORT_API_BASE_URL: 'https://example.invalid' },
    fetchImpl,
  });

  assert.equal(result.executed, true);
  assert.equal(result.data.request_id, 'req_abcdefghijklmnopqrstuvwxyz123456');
  assert.equal(result.data.data.id, '[REDACTED]');
  assert.equal(result.data.data.email, '[REDACTED]');
  assert.equal(result.data.echoed, '[REDACTED]');
  assert.equal(captured.url.origin, API_ORIGIN);
  assert.match(captured.url.pathname, /^\/v1\/accounts\/account%3A%40one\/contacts\/info$/);
  assert.equal(captured.url.searchParams.get('contact_id'), 'contact:@two');
  assert.equal(captured.options.redirect, 'manual');
  assert.equal(captured.options.method, 'GET');
  assert.equal(captured.options.headers['X-Api-Key'], VALID_ENV.UNIFYPORT_API_KEY);
  assert.equal(captured.options.body, undefined);
});

test('GET rejects even an explicitly empty body', () => {
  assert.throws(() => prepareOperation('get-workspace', { body: {} }), /GET operations do not accept a body/);
});

test('path parameters reject separators, controls, and dot segments before encoding', () => {
  for (const accountId of ['', '.', '..', 'a/b', 'a\\b', 'a\nb', 'a\u0000b']) {
    assert.throws(
      () => prepareOperation('get-account', { params: { account_id: accountId } }),
      /Missing or invalid path parameter/,
    );
  }
  assert.doesNotThrow(() => prepareOperation('get-account', { params: { account_id: 'a:@b' } }));
});

test('dangerous object keys, temporary credential fields, and reserved path segments are blocked recursively', () => {
  const prototypePayload = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(
    () => prepareOperation('update-workspace', { body: { metadata: prototypePayload } }),
    /Forbidden request field/,
  );
  assert.throws(
    () => prepareOperation('update-workspace', { body: { metadata: { constructor: { value: true } } } }),
    /Forbidden request field/,
  );

  const forbiddenCredentialKey = ['access', 'key', 'secret'].join('_');
  assert.throws(
    () => prepareOperation('send-text-message', {
      body: { account_id: 'acc_1', to: { id: 'target' }, message: { type: 'text', text: 'hello' }, provider_data: { [forbiddenCredentialKey]: 'value' } },
    }),
    /Forbidden request field/,
  );

  const reservedPath = ['', 'v1', 'internal', 'example'].join('/');
  assert.throws(
    () => prepareOperation('send-text-message', {
      body: { account_id: 'acc_1', to: { id: 'target' }, message: { type: 'text', text: reservedPath } },
    }),
    /Forbidden reserved path segment/,
  );
});

test('public URL fields allow HTTPS while SSRF-shaped URLs fail closed', () => {
  const valid = () => prepareOperation('create-webhook', {
    body: { url: 'https://hooks.example.com/inbound', subscribed_events: ['*'] },
  });
  assert.doesNotThrow(valid);

  const blocked = [
    'http://hooks.example.com/inbound',
    `https://${LOOPBACK_IPV4}/inbound`,
    `https://${PRIVATE_IPV4}/inbound`,
    `https://${RESERVED_IPV4}/inbound`,
    `https://[${['', '', '1'].join(':')}]/inbound`,
    `https://[::ffff:${LOOPBACK_IPV4}]/inbound`,
    `https://${String(0x7f000001)}/inbound`,
    `https://${['0x7f', 0, 0, 1].join('.')}/inbound`,
    `https://${['user', 'pass'].join(':')}@hooks.example.com/inbound`,
    'https://hooks.example.com:8443/inbound',
    `https://${PREPRODUCTION_HOST}/inbound`,
  ];
  for (const url of blocked) {
    assert.throws(
      () => prepareOperation('create-webhook', { body: { url, subscribed_events: ['*'] } }),
      /public HTTPS|absolute HTTPS|public host/,
      url,
    );
  }

  assert.doesNotThrow(() => prepareOperation('send-text-message', {
    body: { account_id: 'acc_1', to: { id: 'target' }, message: { type: 'text', text: 'See https://example.com/help' } },
  }));
});

test('session and proxy inputs are minimal allowlists with public egress validation', () => {
  const validInput = {
    params: { account_id: 'acc_1' },
    body: {
      session_url: 'https://sessions.example.com/export.session',
      pin: '0000',
      proxy_config: { host: 'proxy.example.com', port: 443, proxy_type: 'https' },
    },
  };
  assert.doesNotThrow(() => prepareOperation('import-auth-session', validInput));
  assert.deepEqual(getOperation('import-auth-session').bodyFields, ['session_url', 'pin', 'proxy_config']);

  assert.throws(
    () => prepareOperation('import-auth-session', {
      ...validInput,
      body: { ...validInput.body, proxy_config: JSON.stringify({ host: ['0177', 0, 0, 1].join('.'), port: 1080 }) },
    }),
    /public host/,
  );
  assert.throws(
    () => prepareOperation('import-auth-session', {
      ...validInput,
      body: { ...validInput.body, proxy_config: { host: ['0x7f', 0, 0, 1].join('.'), port: 1080 } },
    }),
    /public host/,
  );
  assert.throws(
    () => prepareOperation('import-auth-session', {
      ...validInput,
      body: { ...validInput.body, proxy_config: { host: 'proxy.example.com', extra: true } },
    }),
    /Unknown proxy field/,
  );
  assert.throws(
    () => prepareOperation('import-auth-session', {
      ...validInput,
      body: { ...validInput.body, session_url: `https://${LOCALHOST}/export.session` },
    }),
    /public host/,
  );
});

test('write calls return a redacted HMAC preview without performing network I/O', async () => {
  let calls = 0;
  const body = { name: 'Private workspace', metadata: { owner: FIXTURE_EMAIL } };
  const result = await runOperation('update-workspace', { body }, {
    env: VALID_ENV,
    nowMs: FIXED_NOW,
    fetchImpl: async () => { calls += 1; return jsonResponse({ ok: true }); },
  });

  assert.equal(result.executed, false);
  assert.equal(result.reason, 'confirmation_required');
  assert.equal(result.preview.body.name, '[REDACTED]');
  assert.equal(result.preview.body.metadata, '[REDACTED]');
  assert.match(result.preview.confirmation.token, /^\d{10,12}\.[a-f0-9]{64}$/);
  assert.match(result.preview.confirmation.expiresAt, /Z$/);
  assert.equal(calls, 0);
});

test('HMAC confirmation binds every value and has a five-minute replay window', async () => {
  const input = { body: { name: 'Workspace A' } };
  const prepared = prepareOperation('update-workspace', input);
  const token = createConfirmationToken(prepared, VALID_ENV, FIXED_NOW);
  const changedToken = createConfirmationToken(
    prepareOperation('update-workspace', { body: { name: 'Workspace B' } }),
    VALID_ENV,
    FIXED_NOW,
  );
  assert.notEqual(token, changedToken);
  assert.notEqual(token, createConfirmationToken(prepared, { UNIFYPORT_API_KEY: 'other' }, FIXED_NOW));

  let calls = 0;
  const valid = await runOperation('update-workspace', input, {
    env: VALID_ENV,
    nowMs: FIXED_NOW + 4 * 60 * 1000,
    confirm: token,
    fetchImpl: async () => { calls += 1; return jsonResponse({ status: 'active' }); },
  });
  assert.equal(valid.executed, true);
  assert.equal(calls, 1);

  const expired = await runOperation('update-workspace', input, {
    env: VALID_ENV,
    nowMs: FIXED_NOW + 301 * 1000,
    confirm: token,
    fetchImpl: async () => { throw new Error('must not execute'); },
  });
  assert.equal(expired.reason, 'confirmation_expired');

  const futureToken = createConfirmationToken(prepared, VALID_ENV, FIXED_NOW + 10 * 60 * 1000);
  const future = await runOperation('update-workspace', input, {
    env: VALID_ENV,
    nowMs: FIXED_NOW,
    confirm: futureToken,
    fetchImpl: async () => { throw new Error('must not execute'); },
  });
  assert.equal(future.reason, 'confirmation_expiry_invalid');
});

test('credential and destructive operations require their explicit opt-ins', async () => {
  const credentialInput = { params: { account_id: 'acc_1' }, body: { code: '123456' } };
  const credentialPrepared = prepareOperation('submit-auth-code', credentialInput);
  const credentialToken = createConfirmationToken(credentialPrepared, VALID_ENV, FIXED_NOW);
  let calls = 0;

  const credentialBlocked = await runOperation('submit-auth-code', credentialInput, {
    env: VALID_ENV,
    nowMs: FIXED_NOW,
    confirm: credentialToken,
    fetchImpl: async () => { calls += 1; return jsonResponse({ ok: true }); },
  });
  assert.equal(credentialBlocked.reason, 'credential_opt_in_required');
  assert.equal(credentialBlocked.preview.body.code, '[REDACTED]');

  const destructiveInput = { params: { account_id: 'acc_1' } };
  const destructiveToken = createConfirmationToken(prepareOperation('delete-account', destructiveInput), VALID_ENV, FIXED_NOW);
  const destructiveBlocked = await runOperation('delete-account', destructiveInput, {
    env: VALID_ENV,
    nowMs: FIXED_NOW,
    confirm: destructiveToken,
    fetchImpl: async () => { calls += 1; return new Response(null, { status: 204 }); },
  });
  assert.equal(destructiveBlocked.reason, 'destructive_opt_in_required');
  assert.equal(calls, 0);
});

test('sensitive path, query, and body fields require full input stdin', () => {
  const cases = [
    ['submit-auth-code', ['--params', '{"account_id":"acc_1"}', '--body', '{"code":"123456"}']],
    ['create-webhook', ['--body', '{"url":"https://hooks.example.com/inbound","signing_secret":"placeholder"}']],
    ['create-account', ['--body', JSON.stringify({ name: 'A', provider: 'telegram', provider_data: { phone: FIXTURE_PHONE } })]],
    ['send-text-message', ['--body', '{"account_id":"acc_1","to":{"id":"target"},"message":{"type":"text","text":"hello"}}']],
    ['get-contact', ['--params', '{"account_id":"acc_1"}', '--query', '{"contact_id":"contact_1"}']],
  ];
  for (const [id, args] of cases) {
    const parsed = parseCallFlags(args);
    assert.throws(() => enforceInputTransport(getOperation(id), parsed), /require --input-stdin/);
  }

  const bodyStdin = parseCallFlags(['--body-stdin']);
  bodyStdin.input.body = { url: 'https://hooks.example.com/inbound', subscribed_events: ['*'] };
  assert.throws(() => enforceInputTransport(getOperation('create-webhook'), bodyStdin), /require --input-stdin/);

  const nonSensitive = parseCallFlags(['--body', '{"status":"active"}']);
  assert.doesNotThrow(() => enforceInputTransport(getOperation('update-workspace'), nonSensitive));
});

test('stdin modes are mutually exclusive and full input stdin produces a redacted preview', async () => {
  for (const args of [
    ['--body-stdin', '--body', '{}'],
    ['--body', '{}', '--body-stdin'],
    ['--input-stdin', '--params', '{}'],
    ['--query', '{}', '--input-stdin'],
    ['--input-stdin', '--body-stdin'],
    ['--body-stdin', '--input-stdin'],
  ]) {
    assert.throws(() => parseCallFlags(args), /mutually exclusive/);
  }

  const preview = await invokeMain([
    'call',
    'submit-auth-code',
    '--input-stdin',
    '--allow-credential',
  ], {
    env: VALID_ENV,
    input: '{"params":{"account_id":"acc_1"},"body":{"code":"654321"}}',
  });
  assert.doesNotMatch(preview, /654321/);
  assert.equal(JSON.parse(preview).reason, 'confirmation_required');
});

test('API key is read only from the environment and rejects empty, oversized, or control-bearing values', async () => {
  const fetchImpl = async () => jsonResponse({ status: 'ok' });
  await assert.doesNotReject(runOperation('get-workspace', {}, {
    env: { UNIFYPORT_API_KEY: 'x' },
    fetchImpl,
  }));

  for (const apiKey of ['', 'line\nbreak', 'a'.repeat(4097)]) {
    await assert.rejects(
      runOperation('get-workspace', {}, { env: { UNIFYPORT_API_KEY: apiKey }, fetchImpl }),
      /UNIFYPORT_API_KEY/,
    );
  }
  await assert.rejects(
    runOperation('get-workspace', {}, { env: {}, fetchImpl }),
    /UNIFYPORT_API_KEY/,
  );
});

test('redirects are never followed and state-changing failures are never retried', async () => {
  let redirectCalls = 0;
  await assert.rejects(
    runOperation('get-workspace', {}, {
      env: VALID_ENV,
      fetchImpl: async (_url, options) => {
        redirectCalls += 1;
        assert.equal(options.redirect, 'manual');
        return new Response(null, { status: 302, headers: { location: 'https://example.com/' } });
      },
    }),
    /Redirect responses are not allowed/,
  );
  assert.equal(redirectCalls, 1);

  const input = { body: { name: 'Workspace' } };
  const token = createConfirmationToken(prepareOperation('update-workspace', input), VALID_ENV, FIXED_NOW);
  let writeCalls = 0;
  const result = await runOperation('update-workspace', input, {
    env: VALID_ENV,
    nowMs: FIXED_NOW,
    confirm: token,
    fetchImpl: async () => {
      writeCalls += 1;
      return jsonResponse({ error: { code: 'temporary_failure' } }, 500);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(writeCalls, 1);
});

test('timeout aborts the request and response size is limited while streaming', async () => {
  await assert.rejects(
    runOperation('get-workspace', {}, {
      env: VALID_ENV,
      timeoutMs: 10,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    }),
    /Request timed out/,
  );

  await assert.rejects(
    runOperation('get-workspace', {}, {
      env: VALID_ENV,
      fetchImpl: async () => new Response('small', {
        headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) },
      }),
    }),
    /Response exceeds size limit/,
  );

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  await assert.rejects(
    runOperation('get-workspace', {}, {
      env: VALID_ENV,
      fetchImpl: async () => new Response(stream),
    }),
    /Response exceeds size limit/,
  );
});

test('non-JSON responses are summarized instead of being printed', async () => {
  const result = await runOperation('get-workspace', {}, {
    env: VALID_ENV,
    fetchImpl: async () => new Response('private upstream output', {
      headers: { 'content-type': 'text/plain' },
    }),
  });
  assert.deepEqual(result.data, { redacted: true, byteLength: 23, mediaType: 'text/plain' });
});

test('redaction scrubs nested identifiers, PII, tokens, and supplied secrets', () => {
  const redacted = redactSensitive({
    request_id: 'req_abcdefghijklmnopqrstuvwxyz123456',
    data: {
      id: 'private_id',
      status: 'running',
      details: `${FIXTURE_EMAIL} called ${FIXTURE_PHONE}`,
      echo: VALID_ENV.UNIFYPORT_API_KEY,
    },
  }, [], [VALID_ENV.UNIFYPORT_API_KEY]);
  assert.equal(redacted.request_id, 'req_abcdefghijklmnopqrstuvwxyz123456');
  assert.equal(redacted.data.id, '[REDACTED]');
  assert.equal(redacted.data.status, 'running');
  assert.ok(!redacted.data.details.includes(FIXTURE_EMAIL));
  assert.ok(!redacted.data.details.includes(FIXTURE_PHONE));
  assert.equal(redacted.data.echo, '[REDACTED]');
});
