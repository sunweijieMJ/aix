/**
 * 发布前质量门禁：test / type-check / lint
 */

import chalk from 'chalk';
import { run } from './shared.js';

// 依次执行 pnpm test / type-check / lint，任一失败即抛出（run 内部已处理非零退出码）
// skip 为 true 时跳过（用于失败重跑等已确认无需重新校验的场景），并打印提醒
export const runQualityGates = (projectRoot: string, skip = false): void => {
  if (skip) {
    console.log(chalk.yellow('⚠️  已跳过发布前质量门禁 (--skip-gates)，请确认此前已单独校验过'));
    return;
  }

  console.log(chalk.blue('运行发布前质量门禁 (test / type-check / lint)...'));

  run('pnpm test', projectRoot);
  run('pnpm type-check', projectRoot);
  run('pnpm lint', projectRoot);

  console.log(chalk.green('✅ 质量门禁通过'));
};
