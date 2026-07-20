import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { scanSensitiveContent } from './bundle-validation.mjs';

// 仓库本身同样公开，因此在 Git 之外扫描完整工作树，覆盖尚未加入索引的新文件。
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.clawhub',
  '.clawdhub',
  'node_modules',
  'coverage',
  'reports',
]);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export class RepositoryValidationError extends Error {
  constructor(issues) {
    super(`Repository validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'RepositoryValidationError';
    this.issues = issues;
  }
}

export async function validateRepository(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const rootStats = await lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new RepositoryValidationError(['repository root must be a real directory']);
  }

  const issues = [];
  let fileCount = 0;
  let totalBytes = 0;

  async function visit(absoluteDirectory, relativeDirectory = '') {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));

    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const stats = await lstat(absolutePath);

      if (stats.isSymbolicLink()) {
        issues.push(`repository symbolic link is forbidden: ${relativePath}`);
        continue;
      }
      if (stats.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }
      if (!stats.isFile()) {
        issues.push(`repository special filesystem entry is forbidden: ${relativePath}`);
        continue;
      }

      if (/(?:^|\/)\.env(?:\.|$)/i.test(relativePath)) {
        issues.push(`repository environment file is forbidden: ${relativePath}`);
      }
      if (/(?:^|\/)(?:id_rsa|id_ed25519|[^/]+\.(?:pem|key|p12|pfx))$/i.test(relativePath)) {
        issues.push(`repository credential file is forbidden: ${relativePath}`);
      }
      if (/\.(?:log|map|zip|tar|tgz|gz)$/i.test(relativePath)) {
        issues.push(`repository generated or archive file is forbidden: ${relativePath}`);
      }

      fileCount += 1;
      totalBytes += stats.size;
      const buffer = await readFile(absolutePath);
      if (buffer.includes(0)) {
        issues.push(`repository file is not UTF-8 text: ${relativePath}`);
        continue;
      }
      let text;
      try {
        text = UTF8_DECODER.decode(buffer);
      } catch {
        issues.push(`repository file is not valid UTF-8: ${relativePath}`);
        continue;
      }
      issues.push(...scanSensitiveContent(relativePath, text, {
        runtime: relativePath.startsWith('skills/unifyport-device-api/scripts/'),
      }));
    }
  }

  await visit(root);
  if (issues.length > 0) {
    throw new RepositoryValidationError([...new Set(issues)]);
  }
  return { root, fileCount, totalBytes };
}
