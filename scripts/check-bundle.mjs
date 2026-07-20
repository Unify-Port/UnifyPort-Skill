#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateBundle } from './lib/bundle-validation.mjs';

// 候选目录即最终上传边界，避免校验结果与真实发布内容产生时间差。
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const skillRoot = path.resolve(process.argv[2] ?? path.join(repositoryRoot, 'skills/unifyport-device-api'));

try {
  const result = await validateBundle(skillRoot);
  console.log(`Bundle OK: ${result.fileCount} UTF-8 files, ${result.totalBytes} bytes.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
