import { fileURLToPath } from 'node:url';
import { validateRelease } from './lib/release-validation.mjs';

// 默认只生成可复核计划；正式发布必须额外满足人工签核，不能把测试通过当作批准。
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  if (process.argv.slice(2).some(arg => arg !== '--require-human-review')) throw new Error('Unsupported release check argument');
  const plan = await validateRelease(root, { requireHumanReview: process.argv.includes('--require-human-review') });
  const { notes, ...publicPlan } = plan;
  console.log(JSON.stringify(publicPlan, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
