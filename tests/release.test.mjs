import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateRelease, buildPublishArguments, SKILL_PATH, CLAWHUB_COMMIT } from '../scripts/lib/release-validation.mjs';
import { runRelease } from '../scripts/run-clawhub-release.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
// 仅在隔离夹具中模拟待签核状态，避免修改真实证据或借用其审批结果。
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unifyport-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'docs'));
  await cp(path.join(repositoryRoot, SKILL_PATH), path.join(root, SKILL_PATH), { recursive: true });
  for (const name of ['package.json', 'docs/public-contract-review.json']) await cp(path.join(repositoryRoot, name), path.join(root, name));
  // 夹具的 pending 状态显式构造，不能依赖真实仓库永远没有完成人工签核。
  const file = path.join(root, 'docs/public-contract-review.json');
  const review = JSON.parse(await readFile(file));
  for (const record of [...review.operations, ...review.fieldCorrections, ...review.providerReviews]) record.humanReviewed = false;
  review.status = 'local-implementation-pending-final-human-review';
  review.releaseApproval = { version: review.releaseVersion, humanReviewed: false, manifestSha256: null };
  await writeFile(file, JSON.stringify(review));
  return root;
}

async function approveFixture(root) {
  const plan = await validateRelease(root);
  const file = path.join(root, 'docs/public-contract-review.json');
  const review = JSON.parse(await readFile(file));
  for (const record of [...review.operations, ...review.fieldCorrections, ...review.providerReviews]) record.humanReviewed = true;
  review.status = 'human-reviewed';
  review.releaseApproval = { version: plan.version, manifestSha256: plan.manifestSha256, humanReviewed: true };
  await writeFile(file, JSON.stringify(review));
  return plan;
}

test('plans one explicit release version and the exact public bundle for both modes', async () => {
  const plan = await validateRelease(repositoryRoot);
  assert.equal(plan.version, '1.1.0'); assert.equal(plan.owner, 'unifyport');
  assert.equal(plan.fileCount, 23);
  // 真实仓库允许准确的 pending 或 approved；两种门禁行为在隔离夹具中验证。
  assert.equal(typeof plan.humanReviewComplete, 'boolean');
  assert.deepEqual(plan.controlFiles.map(file => file.path), ['.clawhubignore']);
  assert.equal(plan.files.some(file => file.path === '.clawhubignore' || file.path.startsWith('tests/')), false);
  for (const locale of ['en', 'zh-CN']) for (const name of ['release-notes.md', 'migration.md']) assert.ok(plan.files.some(file => file.path === `references/${locale}/${name}`));
  const dryRun = buildPublishArguments(plan);
  const publish = buildPublishArguments(plan, { dryRun: false });
  assert.equal(dryRun.at(-1), '--dry-run'); assert.deepEqual(dryRun.slice(0, -1), publish);
  assert.equal(publish[publish.indexOf('--version') + 1], '1.1.0');
  assert.equal(publish[publish.indexOf('--changelog') + 1], plan.notes.en);
  assert.equal(publish[publish.indexOf('publish') + 1], SKILL_PATH);
});

test('rejects metadata, runner and localized release-note version drift', async t => {
  const root = await fixture(t);
  for (const name of ['package.json', `${SKILL_PATH}/SKILL.md`, `${SKILL_PATH}/SKILL.zh-CN.md`, `${SKILL_PATH}/scripts/api-client.mjs`, `${SKILL_PATH}/references/en/release-notes.md`, `${SKILL_PATH}/references/zh-CN/migration.md`]) {
    const file = path.join(root, name); const original = await readFile(file, 'utf8');
    await writeFile(file, original.replaceAll('1.1.0', '1.1.1'));
    await assert.rejects(validateRelease(root), /version mismatch/);
    await writeFile(file, original);
  }
});

test('requires final human approval of the current manifest and invalidates it after a bundle change', async t => {
  const root = await fixture(t);
  const plan = await validateRelease(root);
  assert.equal(plan.humanReviewComplete, false);
  await assert.rejects(validateRelease(root, { requireHumanReview: true }), /Final human evidence/);
  await approveFixture(root);
  assert.equal((await validateRelease(root, { requireHumanReview: true })).humanReviewComplete, true);
  const notes = path.join(root, SKILL_PATH, 'references/en/release-notes.md');
  await writeFile(notes, (await readFile(notes, 'utf8')) + '\nAdditional reviewed detail.\n');
  await assert.rejects(validateRelease(root, { requireHumanReview: true }), /Final human evidence/);
});

test('invalidates human approval when ignore rules change or disappear without changing upload bytes', async t => {
  const root = await fixture(t);
  const plan = await approveFixture(root);
  const ignore = path.join(root, SKILL_PATH, '.clawhubignore');
  await writeFile(ignore, (await readFile(ignore, 'utf8')) + '\nreferences/zh-CN/migration.md\n');
  const changed = await validateRelease(root);
  assert.notEqual(changed.manifestSha256, plan.manifestSha256);
  assert.equal(changed.fingerprint, plan.fingerprint);
  assert.equal(changed.humanReviewComplete, false);
  await assert.rejects(validateRelease(root, { requireHumanReview: true }), /Final human evidence/);
  await approveFixture(root);
  await rm(ignore);
  const removed = await validateRelease(root);
  assert.deepEqual(removed.controlFiles, []);
  await assert.rejects(validateRelease(root, { requireHumanReview: true }), /Final human evidence/);
});

// 只模拟 CLI 返回与身份查询；publish 分支的测试始终注入替身，不执行上传或真实鉴权。
function mockCli(plan, calls, patch = {}) {
  return (command, args, options) => {
    // 同一 Node 可执行文件使 dry-run 与上传都避开 Bun 的 curl transport。
    assert.equal(command, process.execPath);
    assert.equal(options.env.UNIFYPORT_API_KEY, undefined);
    assert.equal(options.env.CLAWHUB_TOKEN, undefined);
    const dryRun = args.includes('--dry-run');
    const config = JSON.parse(readFileSync(options.env.CLAWHUB_CONFIG_PATH));
    assert.equal(config.token, dryRun ? undefined : 'test_release');
    calls.push({ dryRun, configPath: options.env.CLAWHUB_CONFIG_PATH, args });
    return { status: 0, stdout: JSON.stringify({ version: plan.version, slug: plan.slug, fileCount: plan.fileCount, fingerprint: plan.fingerprint, status: dryRun ? 'would-publish' : 'published', ...patch }) };
  };
}

test('rejects an unsigned publish before invoking CLI or identity checks', async t => {
  const root = await fixture(t);
  let calls = 0;
  await assert.rejects(runRelease({ repositoryRoot: root, cliEntry: 'unused.ts', publish: true,
    spawnImpl: () => { calls += 1; }, fetchImpl: () => { calls += 1; },
  }), /Final human evidence/);
  assert.equal(calls, 0);
});

test('rejects a Bun wrapper before any preflight or upload can use curl', () => {
  // 子进程隔离运行时标记，避免污染其他测试；此路径必须在读取签核前拒绝。
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { runRelease } from './scripts/run-clawhub-release.mjs';
    Object.defineProperty(process.versions, 'bun', { value: '1.3.10' });
    let calls = 0;
    await assert.rejects(runRelease({ repositoryRoot: '/unused', cliEntry: '/unused', publish: true,
      spawnImpl: () => { calls += 1; }, fetchImpl: () => { calls += 1; },
    }), /Run the release wrapper with Node.js/);
    assert.equal(calls, 0);
  `], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects mismatched preflight before authentication or any upload even with valid human approval', async t => {
  const root = await fixture(t);
  const plan = await approveFixture(root);
  for (const patch of [{ fileCount: 22 }, { fingerprint: 'wrong' }, { version: '1.1.1' }, { status: 'published' }]) {
    const calls = []; let authCalls = 0;
    await assert.rejects(runRelease({ repositoryRoot: root, cliEntry: 'unused.ts', publish: true,
      env: { CLAWHUB_TOKEN: 'test_release', UNIFYPORT_API_KEY: 'test_fixture' }, spawnImpl: mockCli(plan, calls, patch),
      fetchImpl: () => { authCalls += 1; throw new Error('must not authenticate'); },
    }), /does not match/);
    assert.equal(authCalls, 0);
    assert.equal(calls.length, 1); assert.equal(calls[0].dryRun, true);
    await assert.rejects(stat(calls[0].configPath), { code: 'ENOENT' });
  }
});

test('performs tokenless preflight before identity verification and mocked publication', async t => {
  const root = await fixture(t);
  const plan = await approveFixture(root);
  const calls = []; const order = [];
  const spawn = mockCli(plan, calls);
  const result = await runRelease({ repositoryRoot: root, cliEntry: 'unused.ts', publish: true,
    env: { CLAWHUB_TOKEN: 'test_release', UNIFYPORT_API_KEY: 'test_fixture' },
    spawnImpl: (...args) => { order.push(args[1].includes('--dry-run') ? 'preflight' : 'upload'); return spawn(...args); },
    fetchImpl: async (url, options) => {
      order.push('identity'); assert.equal(url, 'https://clawhub.ai/api/v1/whoami');
      assert.equal(options.headers.Authorization, 'Bearer test_release');
      return new Response(JSON.stringify({ user: { handle: 'unifyport' } }));
    },
  });
  assert.deepEqual(order, ['preflight', 'identity', 'upload']);
  assert.equal(result.status, 'published'); assert.equal(result.humanReviewComplete, true);
  assert.deepEqual(calls[0].args.filter(arg => arg !== '--dry-run'), calls[1].args);
  await assert.rejects(stat(calls[0].configPath), { code: 'ENOENT' });
});

test('rejects a wrong publishing identity after preflight without uploading', async t => {
  const root = await fixture(t); const plan = await approveFixture(root); const calls = [];
  await assert.rejects(runRelease({ repositoryRoot: root, cliEntry: 'unused.ts', publish: true,
    env: { CLAWHUB_TOKEN: 'test_release' }, spawnImpl: mockCli(plan, calls),
    fetchImpl: async () => new Response(JSON.stringify({ user: { handle: 'another_account' } })),
  }), /publisher must be exactly unifyport/);
  assert.equal(calls.length, 1); assert.equal(calls[0].dryRun, true);
  await assert.rejects(stat(calls[0].configPath), { code: 'ENOENT' });
});

test('rejects bundle or ignore changes during preflight and authentication without uploading', async t => {
  for (const name of ['.clawhubignore', 'references/en/release-notes.md']) {
    const root = await fixture(t); const plan = await approveFixture(root); const calls = [];
    await assert.rejects(runRelease({ repositoryRoot: root, cliEntry: 'unused.ts', publish: true,
      env: { CLAWHUB_TOKEN: 'test_release' }, spawnImpl: mockCli(plan, calls),
      fetchImpl: async () => {
        const file = path.join(root, SKILL_PATH, name);
        const change = name === '.clawhubignore' ? '\nreferences/zh-CN/migration.md\n' : '\nChanged during preflight.\n';
        await writeFile(file, (await readFile(file, 'utf8')) + change);
        return new Response(JSON.stringify({ user: { handle: 'unifyport' } }));
      },
    }), /Final human evidence/);
    assert.equal(calls.length, 1); assert.equal(calls[0].dryRun, true);
    await assert.rejects(stat(calls[0].configPath), { code: 'ENOENT' });
  }
});

test('rejects missing field evidence and missing installed migration notes', async t => {
  const root = await fixture(t);
  const file = path.join(root, 'docs/public-contract-review.json');
  const original = await readFile(file, 'utf8');
  const review = JSON.parse(original); review.fieldCorrections.pop();
  await writeFile(file, JSON.stringify(review));
  await assert.rejects(validateRelease(root), /evidence coverage mismatch/);
  await writeFile(file, original);
  await rm(path.join(root, SKILL_PATH, 'references/zh-CN/migration.md'));
  await assert.rejects(validateRelease(root), /migration.md/);
});

test('isolates CLI configuration, strips credentials and rejects a mismatched dry-run fingerprint', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'unifyport-cli-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const plan = await validateRelease(repositoryRoot);
  // 替身只检查参数和临时配置；没有 Bun 或 PATH 命令也必须能由当前 Node 执行。
  const executable = path.join(directory, 'cli.mjs');
  const configRecord = path.join(directory, 'config-path.txt');
  await writeFile(executable, `#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
assert.ok(args.includes('--dry-run'));
assert.equal(args[args.indexOf('--version') + 1], '1.1.0');
assert.equal(args[args.indexOf('--owner') + 1], 'unifyport');
assert.equal(process.env.UNIFYPORT_API_KEY, undefined);
assert.equal(process.env.CLAWHUB_TOKEN, undefined);
assert.equal(JSON.parse(fs.readFileSync(process.env.CLAWHUB_CONFIG_PATH)).token, undefined);
fs.writeFileSync(${JSON.stringify(configRecord)}, process.env.CLAWHUB_CONFIG_PATH);
console.log(JSON.stringify({status:'would-publish',version:'1.1.0',slug:'unifyport-device-api',fileCount:23,fingerprint:process.env.FIXTURE_FINGERPRINT}));
`, { mode: 0o700 });
  const run = fingerprint => spawnSync(process.execPath, ['scripts/run-clawhub-release.mjs', '--cli-entry', executable], { cwd: repositoryRoot, env: { ...process.env, PATH: '', CLAWHUB_TOKEN: 'test_fixture', UNIFYPORT_API_KEY: 'test_fixture', FIXTURE_FINGERPRINT: fingerprint }, encoding: 'utf8' });
  const result = run(plan.fingerprint);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).fingerprint, plan.fingerprint);
  await assert.rejects(stat(await readFile(configRecord, 'utf8')), { code: 'ENOENT' });
  const mismatch = run('wrong');
  assert.equal(mismatch.status, 1); assert.match(mismatch.stderr, /does not match/);
  await assert.rejects(stat(await readFile(configRecord, 'utf8')), { code: 'ENOENT' });
});

test('keeps the workflow on the fixed CLI source and manual main-branch publication boundary', async () => {
  const workflow = await readFile(path.join(repositoryRoot, '.github/workflows/clawhub.yml'), 'utf8');
  assert.ok(workflow.includes(`ref: ${CLAWHUB_COMMIT}`));
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /inputs.publisher_handle == 'unifyport'/);
  assert.match(workflow, /inputs.confirm_publish == true/);
  assert.match(workflow, /check-release.mjs --require-human-review/);
  assert.match(workflow, /run-clawhub-release.mjs --cli-entry/);
  // 构建、真实 transport 回归和发布必须使用同一个固定 CLI 产物。
  assert.match(workflow, /node-version: 24\.x/);
  assert.match(workflow, /bun install --frozen-lockfile/);
  assert.match(workflow, /run: node scripts\/build\.mjs/);
  assert.match(workflow, /node --test tests\/integration\/clawhub-transport\.test\.mjs/);
  assert.match(workflow, /CLAWHUB_CLI_ENTRY: .*clawhub-source\/packages\/clawhub\/dist\/cli\.js/);
  assert.equal((workflow.match(/--cli-entry clawhub-source\/packages\/clawhub\/dist\/cli\.js/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /--cli-entry .*src\/cli\.ts/);
});
