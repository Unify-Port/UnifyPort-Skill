import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { validateRelease } from '../../scripts/lib/release-validation.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

// 必须检验 workflow 构建的真实固定 CLI，不能用自己重写的 fetch 替身证明上游 transport 正确。
test('preserves release JSON and every file through the official Node multipart transport', { timeout: 30000 }, async t => {
  assert.equal(process.versions.bun, undefined);
  const cliEntry = process.env.CLAWHUB_CLI_ENTRY;
  assert.ok(cliEntry, 'Set CLAWHUB_CLI_ENTRY to the pinned official dist/cli.js');
  const { createHttpClient, detectHttpRuntime } = await import(pathToFileURL(path.join(path.dirname(path.resolve(cliEntry)), 'http.js')));
  assert.equal(detectHttpRuntime(), 'node');
  const plan = await validateRelease(repositoryRoot);
  const files = await Promise.all(plan.files.map(async file => ({
    ...file, bytes: await readFile(path.join(repositoryRoot, plan.skillPath, file.path)),
  })));
  let received;
  const loopbackHost = '127.0.0.1';
  // 只监听 loopback，使用无凭据请求；此回归绝不连接 ClawHub 或真实 Device API。
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/api/v1/skills');
      assert.equal(request.headers.authorization, undefined);
      assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/);
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const form = await new Request(`http://${loopbackHost}`, {
        method: 'POST', headers: request.headers, body: Buffer.concat(chunks),
      }).formData();
      received = {
        payload: form.get('payload'),
        files: await Promise.all(form.getAll('files').map(async file => ({
          path: file.name, bytes: Buffer.from(await file.arrayBuffer()),
        }))),
      };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ accepted: true }));
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
  await new Promise(resolve => server.listen(0, loopbackHost, resolve));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const client = createHttpClient({ env: {}, spawnSyncImpl: () => { throw new Error('curl transport is forbidden'); } });
  const registry = `http://${loopbackHost}:${server.address().port}`;
  const cases = [
    ['complete bilingual-link release notes', plan.notes.en],
    ['semicolon form directives', 'Before; after;type=application/json;filename=changed.txt'],
    ['at-sign literal', '@nonexistent-file; no file expansion'],
    ['less-than literal', '<nonexistent-file; no file expansion'],
    ['quotes newlines backslashes and Unicode', '"quoted"\nSecond line\r\n中文说明 \\ end; preserved'],
  ];
  for (const [name, changelog] of cases) await t.test(name, async () => {
    const payload = JSON.stringify({
      slug: plan.slug, displayName: 'UnifyPort Device API', ownerHandle: plan.owner,
      version: plan.version, changelog, acceptLicenseTerms: true, tags: ['latest'],
    });
    const form = new FormData();
    form.set('payload', payload);
    for (const file of files) form.append('files', new Blob([file.bytes]), file.path);
    assert.deepEqual(await client.apiRequestForm(registry, { method: 'POST', path: '/api/v1/skills', form, retryCount: 0 }), { accepted: true });
    assert.deepEqual(Buffer.from(received.payload), Buffer.from(payload));
    assert.equal(JSON.parse(received.payload).changelog, changelog);
    assert.deepEqual(received.files, files.map(({ path, bytes }) => ({ path, bytes })));
  });
});
