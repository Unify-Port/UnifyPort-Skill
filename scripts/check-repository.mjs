#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRepository } from './lib/repository-validation.mjs';

// 默认只扫描当前独立仓库，避免跨越用户明确限定的项目边界。
const repositoryRoot = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url)));

try {
  const result = await validateRepository(repositoryRoot);
  console.log(`Repository OK: ${result.fileCount} UTF-8 files, ${result.totalBytes} bytes.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
