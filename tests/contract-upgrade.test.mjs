import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepareOperation, createConfirmationToken, runOperation, getOperation, redactSensitive } from '../skills/unifyport-device-api/scripts/api-client.mjs';

// 合成鉴权值仅用于离线 HMAC；所有请求使用 mock，不触达真实账号或服务。
const env = { UNIFYPORT_API_KEY: ['offline', 'fixture'].join('_') };
const nowMs = 1800000000000;
const account = { account_id: 'acc_example' };
const timestamp = '2026-11-03T01:02:03.123456789Z';
const cases = [
  ['get-account-operation', { params: { operation_id: 'op_example' } }],
  ['create-auth-session', { params: account }],
  ['submit-passkey-response', { params: account, body: { webauthn_response: '{"id":"credential_example"}' } }],
  ['confirm-passkey', { params: account }],
  ['add-contact', { params: account, body: { phone_number: '123456', whatsapp_options: { sync_to_device_contacts: false } } }],
  ['get-contact-membership', { params: account, query: { contact_id: '9007199254740993@lid' } }],
  ['request-conversation-history', { params: account, body: { conversation_id: '9007199254740993@lid', before: { message_id: 'message_example', sent_at: timestamp, direction: 'inbound' }, limit: 1 } }],
  ['list-posts', { params: account, query: { limit: 1, cursor: 'opaque_cursor' } }],
  ['get-post', { params: account, body: { post_id: '9007199254740993' } }],
  ['list-post-comments', { params: account, body: { post_id: '9007199254740993', limit: 1 } }],
  ['reply-post-comment', { params: account, body: { post_id: '9007199254740993', comment_id: '9007199254740995', text: ' Example ' } }],
  ['create-call', { body: { ...account, to: { id: '9007199254740993', type: 'user' }, media_type: 'voice' } }],
  ['get-active-call', { query: account }],
  ['hangup-call', { params: { call_id: 'call_example' }, body: account }],
];
for (const [id, input] of cases) {
  test(`executes reviewed ${id} with the required confirmation and opt-in`, async () => {
    let calls = 0;
    const operation = getOperation(id);
    const prepared = prepareOperation(id, input);
    const fetchImpl = async (url, options) => {
      calls += 1;
      assert.equal(options.method, operation.method);
      if (id === 'request-conversation-history') assert.equal(JSON.parse(options.body).before.sent_at, timestamp);
      if (id === 'get-post') assert.equal(JSON.parse(options.body).post_id, '9007199254740993');
      return new Response(JSON.stringify({ data: { state: 'PENDING', provider_profile: { cookie: 'hidden_cookie' }, join_url: 'hidden_join', reply_token: 'hidden_reply' } }), { headers: { 'Content-Type': 'application/json' } });
    };
    const options = { env, nowMs, fetchImpl };
    if (operation.risk !== 'read') {
      const preview = await runOperation(id, input, options);
      assert.equal(preview.executed, false);
      assert.equal(calls, 0);
      options.confirm = createConfirmationToken(prepared, env, nowMs);
      if (operation.confirmation.optIn === 'credential') options.allowCredential = true;
      if (operation.confirmation.optIn === 'destructive') options.allowDestructive = true;
    }
    const result = await runOperation(id, input, options);
    assert.equal(result.executed, true);
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(result), /hidden_cookie|hidden_join|hidden_reply/);
  });
}

test('binds idempotency headers into confirmation and never permits authentication overrides', async () => {
  const input = { headers: { 'Idempotency-Key': 'creation_example' }, body: { provider: 'facebook', auth_mode: 'session', region: 'region_example' } };
  const token = createConfirmationToken(prepareOperation('create-account', input), env, nowMs);
  for (const changed of [{ ...input, headers: { 'Idempotency-Key': 'another_creation' } }, { body: input.body }, { ...input, body: { ...input.body, region: 'other_region' } }]) {
    const result = await runOperation('create-account', changed, { env, nowMs, confirm: token, fetchImpl: () => { throw new Error('must not execute'); } });
    assert.equal(result.reason, 'confirmation_mismatch');
  }
  let calls = 0;
  await runOperation('create-account', input, { env, nowMs, confirm: token, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(options.headers['Idempotency-Key'], 'creation_example');
    return new Response('{}');
  } });
  assert.equal(calls, 1);
  for (const headers of [{ 'X-Api-Key': '<API_KEY>' }, { 'Idempotency-Key': '' }, { 'Idempotency-Key': 'x\r\ny' }, { 'Idempotency-Key': 'x'.repeat(129) }]) {
    assert.throws(() => prepareOperation('create-account', { ...input, headers }));
  }
  assert.throws(() => prepareOperation('update-account', { params: account, headers: input.headers }));
});

test('validates bounded account pagination and preserves opaque cursor without auto-pagination', async () => {
  for (const limit of [0, 101, 1.5, null, '1']) assert.throws(() => prepareOperation('list-accounts', { query: { limit } }));
  assert.throws(() => prepareOperation('list-accounts', { query: { cursor: ['a', 'b'] } }));
  let calls = 0;
  const result = await runOperation('list-accounts', { query: { limit: 100, cursor: 'opaque_cursor' } }, { env, fetchImpl: async url => {
    calls += 1; assert.equal(url.searchParams.get('cursor'), 'opaque_cursor');
    return new Response(JSON.stringify({ data: { items: [], has_more: false, next_cursor: '' } }), { headers: { 'Content-Type': 'application/json' } });
  } });
  assert.equal(calls, 1); assert.equal(result.data.data.has_more, false); assert.equal(result.data.data.next_cursor, '');
});

test('keeps reviewed POST reads separate from write approval', async () => {
  for (const id of ['get-post','list-post-comments']) assert.equal(getOperation(id).risk, 'read');
  assert.equal(getOperation('reply-post-comment').risk, 'write');
});

test('rejects invalid new fields and unsupported Facebook authorization before network I/O', () => {
  const invalid = [
    ['create-account', { body: { provider: 'facebook', auth_mode: 'qrcode' } }],
    ['update-account', { params: account, body: { auth_mode: 'session', name: 'mixed' } }],
    ['submit-passkey-response', { params: account, body: { webauthn_response: {} } }],
    ['add-contact', { params: account, body: {} }],
    ['get-contact-membership', { params: account, query: {} }],
    ['get-post', { params: account, body: { post_id: 9007199254740992 } }],
    ['reply-post-comment', { params: account, body: { post_id: 'post_example', text: '  ' } }],
    ['create-call', { body: { ...account, to: { id: 'group_example', type: 'group' }, media_type: 'voice' } }],
    ['get-active-call', { query: { account_id: 'invalid' } }],
    ['hangup-call', { params: { call_id: '../invalid' }, body: account }],
  ];
  for (const [id, input] of invalid) assert.throws(() => prepareOperation(id, input));
  const history = cases.find(([id]) => id === 'request-conversation-history')[1];
  for (const before of [{ ...history.body.before, message_id: 'call_record_' + 'a'.repeat(64) }, { ...history.body.before, sent_at: 123 }, { ...history.body.before, type: 'call' }]) {
    assert.throws(() => prepareOperation('request-conversation-history', { ...history, body: { ...history.body, before } }));
  }
});

test('keeps async deletion acceptance and legacy 204 separate from completion', async () => {
  const input = { params: account };
  const confirm = createConfirmationToken(prepareOperation('delete-account', input), env, nowMs);
  for (const status of [202, 204]) {
    let calls = 0;
    const result = await runOperation('delete-account', input, { env, nowMs, confirm, allowDestructive: true, fetchImpl: async () => {
      calls += 1;
      return new Response(status === 204 ? null : JSON.stringify({ data: { operation_id: 'op_example', state: 'PENDING' } }), { status, headers: { 'Content-Type': 'application/json' } });
    } });
    assert.equal(result.status, status); assert.equal(calls, 1);
    if (status === 204) assert.equal(result.data, null);
    else assert.equal(result.data.data.state, 'PENDING');
  }
});

test('preserves sparse false/zero/empty values while redacting new credential material', () => {
  const source = { runtime_status: 'error', auth_status: 'authorized', flag: false, count: 0, text: '', items: [], join_url: 'private_link', webauthn_response: 'private_webauthn', provider_profile: { cookie: 'private_cookie' } };
  const before = JSON.stringify(source);
  const safe = redactSensitive(source);
  assert.equal(safe.flag, false); assert.equal(safe.count, 0); assert.deepEqual(safe.items, []);
  assert.equal(safe.runtime_status, 'error'); assert.equal(safe.auth_status, 'authorized');
  assert.doesNotMatch(JSON.stringify(safe), /private_link|private_webauthn|private_cookie/);
  assert.equal(JSON.stringify(source), before);
});

test('documents four standard Facebook callbacks and explicit human review metadata', () => {
  const review = JSON.parse(readFileSync(new URL('../docs/public-contract-review.json', import.meta.url)));
  assert.equal(review.operations.length, 14);
  // 签核是可推进的人工状态；测试只校验显式记录，不得把真实仓库锁死在 pending。
  assert.ok([...review.operations, ...review.fieldCorrections, ...review.providerReviews]
    .every(record => typeof record.humanReviewed === 'boolean'));
  assert.equal(typeof review.status, 'string');
  assert.ok(review.status.length > 0);
  const capabilities = readFileSync(new URL('../skills/unifyport-device-api/references/en/provider-capabilities.md', import.meta.url), 'utf8');
  assert.match(capabilities, /Facebook/); assert.match(capabilities, /inbound or outbound/); assert.match(capabilities, /no read\/delivery receipts/);
});

// 空代理代表账号 PATCH 的显式清除，必须保留请求原文并受同一 HMAC 确认约束。
test('preserves omitted, cleared and non-empty account proxies through confirmed PATCH requests', async () => {
  const bodies = [{}, { proxy: {} }, { proxy: { host: 'proxy.example.com', port: 443, type: 'https' } }];
  for (const body of bodies) {
    const input = { params: account, body };
    const before = structuredClone(input);
    const prepared = prepareOperation('update-account', input);
    assert.deepEqual(JSON.parse(prepared.serializedBody), body);
    let calls = 0;
    const fetchImpl = async (url, options) => {
      calls += 1;
      assert.equal(options.method, 'PATCH');
      assert.equal(url.pathname, '/v1/accounts/acc_example');
      assert.deepEqual(JSON.parse(options.body), body);
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    };
    const preview = await runOperation('update-account', input, { env, nowMs, fetchImpl });
    assert.equal(preview.reason, 'confirmation_required');
    assert.equal(calls, 0);
    const confirm = createConfirmationToken(prepared, env, nowMs);
    const result = await runOperation('update-account', input, { env, nowMs, confirm, fetchImpl });
    assert.equal(result.executed, true);
    assert.equal(calls, 1);
    assert.deepEqual(input, before);
  }
});

// 省略代理和清空代理有不同业务含义，确认清空后不能偷偷改成保留或替换。
test('binds account proxy clearing separately from omission or replacement', async () => {
  const input = { params: account, body: { proxy: {} } };
  const confirm = createConfirmationToken(prepareOperation('update-account', input), env, nowMs);
  for (const body of [{}, { proxy: { host: 'proxy.example.com', port: 443 } }]) {
    const result = await runOperation('update-account', { params: account, body }, {
      env, nowMs, confirm,
      fetchImpl: () => { throw new Error('must not execute'); },
    });
    assert.equal(result.reason, 'confirmation_mismatch');
  }
});

// 清空例外只适用于账号 PATCH 的顶层 proxy，导入与嵌套配置仍须校验公网出口。
test('keeps proxy clear support scoped and rejects invalid or private proxy configurations', () => {
  const invalidBodies = [
    { proxy: null },
    { proxy: [] },
    { proxy: { host: [127, 0, 0, 1].join('.') } },
    { proxy: { host: 'proxy.example.com', extra: true } },
    { proxy: { host: 'proxy.example.com', port: 0 } },
    { proxy: { host: 'proxy.example.com', type: 'invalid' } },
    { provider_data: { proxy: {} } },
  ];
  for (const body of invalidBodies) {
    assert.throws(() => prepareOperation('update-account', { params: account, body }));
  }
  assert.throws(() => prepareOperation('create-account', { body: { proxy: {} } }));
  assert.throws(() => prepareOperation('import-auth-session', {
    params: account,
    body: { session_url: 'https://sessions.example.com/export', proxy_config: {} },
  }));
});
