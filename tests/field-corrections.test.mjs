import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareOperation, createConfirmationToken, runOperation, getOperation, redactSensitive, enforceInputTransport, parseCallFlags, main } from '../skills/unifyport-device-api/scripts/api-client.mjs';
import { validateOperationsCatalog } from '../scripts/lib/catalog-validation.mjs';

// 占位协议材料只用于离线验证；短值故意不满足通用 token 脱敏启发式。
const env = { UNIFYPORT_API_KEY: ['offline', 'fixture'].join('_') };
const nowMs = 1800000000000;
const params = { account_id: 'acc_example' };
const protocol = { phone: ['+1', '(234)', '567-890'].join(' '), static_pub_key: 'spub', static_pri_key: 'spri', identity_pub_key: 'ipub', identity_pri_key: 'ipri' };
const input = (value = protocol) => ({ params, body: { 'whatsapp-protocol': value } });
const response = (value) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('imports exact protocol fields without coercion and requires credential opt-in plus HMAC', async () => {
  const credentials = { ...protocol, platform: -2147483648, device: 0, app_version: '', country: '', server_address: 'example.com:443', fallback_server_addresses: ['backup.example.com:443'], hash: 'old', peer_kem_public: 'kem', auth_hex_data: 'abcd', authhexdata: 'dcba', pq_handshake_mode: '', use_xxkem_handshake: false };
  const request = input(credentials);
  const confirm = createConfirmationToken(prepareOperation('import-auth-session', request), env, nowMs);
  let calls = 0;
  const options = { env, nowMs, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url.origin, 'https://api.unifyport.ai');
    assert.deepEqual(JSON.parse(options.body), request.body);
    assert.equal(options.redirect, 'manual');
    return response({ data: { 'whatsapp-protocol': credentials, ...credentials, auth_status: 'authorized', runtime_status: 'stopped' } });
  } };
  const preview = await runOperation('import-auth-session', request, options);
  assert.equal(preview.reason, 'credential_opt_in_required');
  assert.equal(preview.preview.body['whatsapp-protocol'], '[REDACTED]');
  assert.equal((await runOperation('import-auth-session', request, { ...options, confirm })).executed, false);
  assert.equal((await runOperation('import-auth-session', request, { ...options, allowCredential: true })).reason, 'confirmation_required');
  assert.equal(calls, 0);
  for (const key of Object.keys(credentials)) {
    const changed = input({ ...credentials, [key]: key === 'server_address' ? 'other.example.com' : typeof credentials[key] === 'boolean' ? true : typeof credentials[key] === 'number' ? 1 : Array.isArray(credentials[key]) ? ['other.example.com'] : 'changed' });
    assert.equal((await runOperation('import-auth-session', changed, { ...options, confirm, allowCredential: true })).reason, 'confirmation_mismatch');
  }
  const result = await runOperation('import-auth-session', request, { ...options, confirm, allowCredential: true });
  assert.equal(calls, 1);
  assert.equal(result.executed, true);
  assert.equal(result.data.data.runtime_status, 'stopped');
  for (const key of ['phone', 'static_pub_key', 'static_pri_key', 'identity_pub_key', 'identity_pri_key', 'hash', 'peer_kem_public', 'auth_hex_data', 'authhexdata']) assert.equal(result.data.data[key], '[REDACTED]');
});

test('rejects incomplete, mistyped, unknown and platform-injected protocol credentials', () => {
  for (const key of Object.keys(protocol)) {
    const missing = { ...protocol }; delete missing[key];
    for (const value of [missing, { ...protocol, [key]: '' }, { ...protocol, [key]: '  ' }, { ...protocol, [key]: null }, { ...protocol, [key]: 1 }]) assert.throws(() => prepareOperation('import-auth-session', input(value)));
  }
  const invalid = [null, [], 'encoded', {}, { ...protocol, edge_routing: 'forbidden' }, { ...protocol, unknown: true }, { ...protocol, platform: 2147483648 }, { ...protocol, platform: -2147483649 }, { ...protocol, platform: '1' }, { ...protocol, device: -1 }, { ...protocol, device: 4294967296 }, { ...protocol, device: 0.5 }, { ...protocol, use_xxkem_handshake: 'false' }, { ...protocol, fallback_server_addresses: ['example.com', 1] }, { ...protocol, auth_hex_data: null }];
  for (const value of invalid) assert.throws(() => prepareOperation('import-auth-session', input(value)));
  assert.doesNotThrow(() => prepareOperation('import-auth-session', input({ ...protocol, platform: 2147483647, device: 4294967295 })));
  for (const address of [[127, 0, 0, 1].join('.'), ['local', 'host'].join(''), '[::1]', 'user@example.com', 'example.com/path', 'example.com?x=y']) {
    for (const field of ['server_address', 'fallback_server_addresses']) assert.throws(() => prepareOperation('import-auth-session', input({ ...protocol, [field]: field === 'server_address' ? address : [address] })));
  }
});

test('prevents protocol credential routing through ordinary writes or provider_data', () => {
  for (const body of [{ provider_data: { 'whatsapp-protocol': protocol } }, { provider_data: { static_pri_key: 'spri' } }, { metadata: { nested: [{ auth_hex_data: 'abcd' }] } }]) {
    assert.throws(() => prepareOperation('update-account', { params, body }), /Protocol credentials require/);
  }
  assert.throws(() => prepareOperation('create-account', { body: { provider_data: protocol } }), /Protocol credentials require/);
  assert.throws(() => prepareOperation('import-auth-session', { params, body: { ...protocol } }), /Unknown body field/);
  assert.throws(() => prepareOperation('update-account', { params, body: { provider_account_ref: 'new_identity' } }), /Unknown body field/);
});

test('requires full stdin for credentials and redacts nested and scattered short protocol keys', async () => {
  const operation = getOperation('import-auth-session');
  assert.throws(() => enforceInputTransport(operation, parseCallFlags(['--params', JSON.stringify(params), '--body', JSON.stringify(input().body)])), /require --input-stdin/);
  let output = '';
  await main(['call', operation.id, '--input-stdin'], { env, stdout: { write: value => { output += value; } }, stdin: { async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(input())); } } });
  assert.equal(JSON.parse(output).preview.body['whatsapp-protocol'], '[REDACTED]');
  const safe = redactSensitive({ nested: { 'whatsapp-protocol': protocol }, ...protocol, peer_kem_public: 'kem', authhexdata: 'abcd' });
  for (const value of Object.values(protocol)) assert.equal(JSON.stringify(safe).includes(value), false);
});

test('passes label_id exactly once without trimming or ID coercion', async () => {
  const label_id = ' 9007199254740993/+label ';
  let calls = 0;
  const result = await runOperation('list-conversations', { params, query: { label_id } }, { env, fetchImpl: async url => {
    calls += 1;
    assert.deepEqual(url.searchParams.getAll('label_id'), [label_id]);
    return response({ data: { items: [], next_cursor: '', has_more: false } });
  } });
  assert.equal(calls, 1); assert.equal(result.executed, true);
  for (const value of [null, 1, ['a', 'b'], {}]) assert.throws(() => prepareOperation('list-conversations', { params, query: { label_id: value } }));
  assert.doesNotThrow(() => prepareOperation('list-conversations', { params, query: { label_id: '' } }));
  assert.equal(prepareOperation('list-conversations', { params }).url.searchParams.has('label_id'), false);
});

test('preserves channel-specific read receipt forms and binds sender into confirmation', async () => {
  const body = { conversation_id: 'group/@peer:example', up_to_message_id: ' msg_one,msg_two ', up_to_message_sender_id: ' sender/@example ' };
  const request = { params, body };
  const confirm = createConfirmationToken(prepareOperation('mark-conversation-read', request), env, nowMs);
  let calls = 0;
  const options = { env, nowMs, confirm, fetchImpl: async (url, options) => { calls += 1; assert.deepEqual(JSON.parse(options.body), body); return response({ data: { ok: true } }); } };
  for (const changed of [{ ...body, up_to_message_sender_id: 'other' }, { conversation_id: body.conversation_id, up_to_message_id: body.up_to_message_id }]) assert.equal((await runOperation('mark-conversation-read', { params, body: changed }, options)).reason, 'confirmation_mismatch');
  assert.equal(calls, 0);
  const result = await runOperation('mark-conversation-read', request, options);
  assert.equal(result.executed, true); assert.equal(calls, 1);
  for (const fields of [{}, { up_to_message_id: ' 123 ' }, { up_to_message_id: '', up_to_message_sender_id: ' ' }]) assert.doesNotThrow(() => prepareOperation('mark-conversation-read', { params, body: { conversation_id: 'peer', ...fields } }));
  for (const fields of [{ up_to_message_sender_id: 'sender' }, { up_to_message_id: '', up_to_message_sender_id: 'sender' }, { up_to_message_sender_id: null }, { up_to_message_id: 123 }]) assert.throws(() => prepareOperation('mark-conversation-read', { params, body: { conversation_id: 'peer', ...fields } }));
  assert.equal(redactSensitive(body).up_to_message_sender_id, '[REDACTED]');
});

for (const id of ['list-webhooks', 'get-webhook', 'create-webhook', 'update-webhook', 'deactivate-webhook', 'delete-webhook']) {
  test(`validates account scope, location and approval for ${id}`, async () => {
    const writesBody = ['create-webhook', 'update-webhook'].includes(id);
    const operation = getOperation(id);
    const request = { ...(operation.pathParams.length ? { params: { endpoint_id: 'endpoint_example' } } : {}), [writesBody ? 'body' : 'query']: { account_id: ' acc_example ', ...(writesBody ? { url: 'https://example.com/hook' } : {}) } };
    const location = writesBody ? 'body' : 'query';
    for (const value of ['', ' \t', null, 1, ['a', 'b'], {}]) assert.throws(() => prepareOperation(id, { ...request, [location]: { ...request[location], account_id: value } }));
    for (const key of ['Account_id', 'AccountID', 'accountId']) assert.throws(() => prepareOperation(id, { ...request, [location]: { ...request[location], [key]: 'acc_other' } }), /Unknown/);
    assert.throws(() => prepareOperation(id, { ...request, [writesBody ? 'query' : 'body']: { account_id: 'acc_other' } }));
    assert.doesNotThrow(() => prepareOperation(id, { ...(request.params ? { params: request.params } : {}) }));
    const confirm = operation.risk === 'read' ? undefined : createConfirmationToken(prepareOperation(id, request), env, nowMs);
    let calls = 0;
    const options = { env, nowMs, fetchImpl: async (url, options) => { calls += 1; assert.equal(writesBody ? JSON.parse(options.body).account_id : url.searchParams.get('account_id'), ' acc_example '); return response({ data: { account_id: 'acc_example', status: 'active' } }); } };
    if (confirm) {
      assert.equal((await runOperation(id, request, options)).executed, false);
      const changed = { ...request, [location]: { ...request[location], account_id: 'acc_other' } };
      assert.equal((await runOperation(id, changed, { ...options, confirm, allowDestructive: true })).reason, 'confirmation_mismatch');
      assert.equal(calls, 0);
    }
    const result = await runOperation(id, request, { ...options, confirm, allowDestructive: true });
    assert.equal(calls, 1); assert.equal(result.data.data.account_id, '[REDACTED]');
    assert.throws(() => enforceInputTransport(operation, parseCallFlags([writesBody ? '--body' : '--query', JSON.stringify(request[location])])), /require --input-stdin/);
  });
}

test('rejects reviewed field drift even when action and route counts are unchanged', () => {
  const catalog = JSON.parse(readFileSync(new URL('../skills/unifyport-device-api/references/operations.json', import.meta.url)));
  for (const [id, field] of [['list-conversations', 'queryFields'], ['import-auth-session', 'bodyFields'], ['update-webhook', 'bodyFields']]) {
    const changed = structuredClone(catalog);
    changed.operations.find(o => o.id === id)[field].pop();
    assert.throws(() => validateOperationsCatalog(changed), /differs from reviewed request fields/);
  }
});

test('rejects duplicate account ownership keys including escaped JSON keys before execution', async () => {
  // 原始 JSON 夹具覆盖 JSON.parse 的 last-write-wins；对象形式无法保留重复键。
  const duplicate = '{"query":{"account_id":"acc_one","account_id":"acc_two"}}';
  const escaped = duplicate.replace('"account_id":"acc_two"', '"account\\u005fid":"acc_two"');
  for (const source of [duplicate, escaped]) {
    await assert.rejects(main(['call', 'list-webhooks', '--input-stdin'], { env, stdout: { write: () => { throw new Error('must not output'); } }, stdin: { async *[Symbol.asyncIterator]() { yield Buffer.from(source); } } }), /valid JSON object/);
  }
  assert.doesNotThrow(() => parseCallFlags(['--body', '{"metadata":{"a":{"account_id":"one"},"b":{"account_id":"two"}}}']));
});
