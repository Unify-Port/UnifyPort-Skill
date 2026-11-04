import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { validateRelease, buildPublishArguments, PUBLISHER } from './lib/release-validation.mjs';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));

// 测试通过显式注入替身覆盖发布顺序，CLI 不开放这些替身或仓库路径覆盖选项。
export async function runRelease({ repositoryRoot = defaultRoot, cliEntry, publish = false, env = process.env, spawnImpl = spawnSync, fetchImpl = globalThis.fetch }) {
  // Bun 的官方 CLI 会进入 curl -F 分支，分号等正文会被解释成表单语法，必须使用 Node transport。
  if (process.versions.bun) throw new Error('Run the release wrapper with Node.js and the compiled official CLI');
  const root = path.resolve(repositoryRoot);
  const plan = await validateRelease(root, { requireHumanReview: publish });
  const configDirectory = await mkdtemp(path.join(os.tmpdir(), 'unifyport-clawhub-'));
  try {
    const configPath = path.join(configDirectory, 'config.json');
    // 即使正式发布，也先以隔离、无 token 的配置核对官方 CLI 的实际上传清单。
    await writeFile(configPath, JSON.stringify({ registry: 'https://clawhub.ai' }), { mode: 0o600 });
    const childEnv = { ...env, CLAWHUB_CONFIG_PATH: configPath };
    delete childEnv.UNIFYPORT_API_KEY;
    delete childEnv.CLAWHUB_TOKEN;
    delete childEnv.CLAWDHUB_CONFIG_PATH;
    const invoke = (dryRun) => {
      const command = buildPublishArguments(plan, { dryRun });
      if (env.GITHUB_REPOSITORY && env.GITHUB_SHA) command.push('--source-repo', env.GITHUB_REPOSITORY, '--source-commit', env.GITHUB_SHA, '--source-path', plan.skillPath);
      const result = spawnImpl(process.execPath, [path.resolve(cliEntry), ...command], { cwd: root, env: childEnv, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 180000 });
      if (result.error || result.status !== 0) throw new Error('ClawHub CLI failed; inspect the redacted dry-run environment before retrying');
      let output;
      try { output = JSON.parse(result.stdout); } catch { throw new Error('ClawHub CLI returned invalid JSON'); }
      if (output?.version !== plan.version || output.slug !== plan.slug || output.fileCount !== plan.fileCount || output.fingerprint !== plan.fingerprint
        || (dryRun && output.status !== 'would-publish')) throw new Error('ClawHub result does not match the reviewed release plan');
      return output;
    };
    let output = invoke(true);
    if (publish) {
      const token = env.CLAWHUB_TOKEN;
      if (!token) throw new Error('ClawHub release authentication is required');
      let identity;
      try {
        const result = await fetchImpl('https://clawhub.ai/api/v1/whoami', { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (result.ok) identity = await result.json();
      } catch {
        // 不转发第三方网络错误，避免认证信息进入 workflow 日志。
      }
      if (identity?.user?.handle !== PUBLISHER) throw new Error('ClawHub publisher must be exactly unifyport');
      // preflight 与鉴权期间若目录或过滤规则变化，禁止沿用旧计划执行上传。
      const current = await validateRelease(root, { requireHumanReview: true });
      if (current.manifestSha256 !== plan.manifestSha256) throw new Error('Release bundle changed after dry-run preflight');
      await writeFile(configPath, JSON.stringify({ registry: 'https://clawhub.ai', token }), { mode: 0o600 });
      output = invoke(false);
    }
    return { ...output, owner: PUBLISHER, manifestSha256: plan.manifestSha256, humanReviewComplete: plan.humanReviewComplete };
  } finally {
    await rm(configDirectory, { recursive: true, force: true });
  }
}

// 默认只 dry-run；正式发布的上传前检查与上传后结果校验都不可跳过。
export async function main(args = process.argv.slice(2)) {
  const publish = args.includes('--publish');
  const entry = args.indexOf('--cli-entry');
  if (entry < 0 || !args[entry + 1] || args.some((arg, index) => index !== entry + 1 && !['--cli-entry', '--publish'].includes(arg))
    || args.filter(arg => arg === '--cli-entry').length !== 1 || args.filter(arg => arg === '--publish').length > 1) throw new Error('Use --cli-entry PATH with optional --publish');
  return runRelease({ cliEntry: args[entry + 1], publish });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
