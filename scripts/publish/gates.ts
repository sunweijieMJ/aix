/**
 * 发布前质量门禁：test / type-check / lint
 */

import chalk from 'chalk';
import { run } from './shared.js';

// 依次执行 pnpm test / type-check / lint，任一失败即抛出（run 内部已处理非零退出码）
// 默认跳过（发布流程本身较繁琐，质量校验交由 CI 或开发时单独执行）
// enable 为 true 时才实际执行（配合 --with-gates 使用）
export const runQualityGates = (projectRoot: string, enable = false): void => {
  if (!enable) {
    console.log(chalk.gray('ℹ️  已跳过发布前质量门禁 (默认跳过，如需校验请加 --with-gates)'));
    return;
  }

  console.log(chalk.blue('运行发布前质量门禁 (test / type-check / lint)...'));

  run('pnpm test', projectRoot);
  run('pnpm type-check', projectRoot);
  run('pnpm lint', projectRoot);

  console.log(chalk.green('✅ 质量门禁通过'));
};
