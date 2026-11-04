import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { validateBundle } from './bundle-validation.mjs';
import { PUBLIC_CONTRACT } from './catalog-validation.mjs';

export const SKILL_PATH = 'skills/unifyport-device-api';
export const PUBLISHER = 'unifyport';
export const CLAWHUB_COMMIT = 'ed9c8fdda2119176ba21d33e81823f8de79a6960';

// 发布计划取自最终物理目录，版本与签核不能沿用旧 CI 或自动补丁推断。
export async function validateRelease(repositoryRoot, { requireHumanReview = false } = {}) {
  const root = path.resolve(repositoryRoot);
  const skillRoot = path.join(root, SKILL_PATH);
  await validateBundle(skillRoot);
  const read = name => readFile(path.join(root, name), 'utf8');
  const pkg = JSON.parse(await read('package.json'));
  const version = pkg.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
  for (const name of ['SKILL.md', 'SKILL.zh-CN.md']) {
    const text = await read(`${SKILL_PATH}/${name}`);
    if (/^Version: (.+)$/m.exec(text)?.[1] !== version
      || (name === 'SKILL.md' && /^version: (.+)$/m.exec(text)?.[1] !== version)) throw new Error(`Release version mismatch: ${name}`);
  }
  const runtime = await read(`${SKILL_PATH}/scripts/api-client.mjs`);
  if (/export const SKILL_VERSION = '([^']+)'/.exec(runtime)?.[1] !== version) throw new Error('Release version mismatch: runner');
  const notes = {};
  for (const locale of ['en', 'zh-CN']) {
    for (const name of ['release-notes.md', 'migration.md']) {
      const text = await read(`${SKILL_PATH}/references/${locale}/${name}`);
      if (!text.split('\n', 1)[0].includes(version)) throw new Error(`Release version mismatch: ${locale}/${name}`);
      if (name === 'release-notes.md') notes[locale] = text;
    }
  }
  const files = [];
  const controlFiles = [];
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative);
      else {
        const bytes = await readFile(path.join(directory, entry.name));
        // ignore 本身不上传，但决定实际清单；增删或修改它都必须使人工签核失效。
        const destination = relative === '.clawhubignore' ? controlFiles : files;
        destination.push({ path: relative, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  await visit(skillRoot);
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const manifestSha256 = createHash('sha256').update(JSON.stringify({ files, controlFiles })).digest('hex');
  // 与固定官方 CLI 的公开 fingerprint 算法对齐，返回数量相同但字节不同也不能通过。
  const fingerprint = createHash('sha256').update(files.slice().sort((a, b) => a.path.localeCompare(b.path))
    .map(file => `${file.path}:${file.sha256}`).join('\n')).digest('hex');
  const review = JSON.parse(await read('docs/public-contract-review.json'));
  const expectedCorrections = Object.keys(PUBLIC_CONTRACT.reviewedRequestFields);
  if (review.releaseVersion !== version || review.fieldCorrections?.length !== expectedCorrections.length
    || expectedCorrections.some(id => review.fieldCorrections.filter(record => record.actionId === id).length !== 1)) throw new Error('Release evidence coverage mismatch');
  const records = [...review.operations, ...review.fieldCorrections, ...review.providerReviews];
  const humanReviewComplete = records.length === 24 && records.every(record => record?.humanReviewed === true)
    && review.releaseApproval?.version === version && review.releaseApproval?.humanReviewed === true
    && review.releaseApproval?.manifestSha256 === manifestSha256;
  if (requireHumanReview && !humanReviewComplete) throw new Error('Final human evidence and exact-bundle approval are required before publication');
  return { version, owner: PUBLISHER, slug: 'unifyport-device-api', skillPath: SKILL_PATH, fileCount: files.length, files, controlFiles, manifestSha256, fingerprint, humanReviewComplete, notes };
}

export function buildPublishArguments(plan, { dryRun = true } = {}) {
  // dry-run 与真实发布显式共享版本、owner、说明及唯一目录，不允许 CLI 自动生成补丁版本。
  return ['--workdir', '.', '--site', 'https://clawhub.ai', '--registry', 'https://clawhub.ai',
    'skill', 'publish', SKILL_PATH, '--owner', PUBLISHER, '--slug', 'unifyport-device-api',
    '--name', 'UnifyPort Device API', '--version', plan.version, '--changelog', plan.notes.en,
    '--json', ...(dryRun ? ['--dry-run'] : [])];
}
