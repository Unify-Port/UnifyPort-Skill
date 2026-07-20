#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCatalogFiles } from './lib/catalog-validation.mjs';

// 默认路径固定到唯一公开 Skill，避免从仓库其他目录意外取数。
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const skillRoot = path.resolve(process.argv[2] ?? path.join(repositoryRoot, 'skills/unifyport-device-api'));

try {
  const result = await validateCatalogFiles(skillRoot);
  console.log(`Catalog OK: ${result.operations.documentedActions} actions, ${result.operations.uniqueRoutes} routes, ${result.events.events} events.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
