import { execSync } from 'child_process';
import chalk from 'chalk';

// 获取提交信息文件路径
const COMMIT_MESSAGE_FILE = process.argv[2];
if (!COMMIT_MESSAGE_FILE) {
  console.error(chalk.red('❌ 没有提供 commit message 文件路径'));
  process.exit(1);
}
// commitlint校验
// 格式校验完全交给 commitlint（与 commitlint.config.ts 单一口径），
// 它原生支持 breaking-change 标记（feat!:）并自动放行 Merge/Revert 等 git 生成的消息
try {
  execSync(`npx --no-install commitlint --edit ${COMMIT_MESSAGE_FILE}`);
  console.log(chalk.green('✅ Commitlint 检查通过'));
} catch (error) {
  console.error(`${chalk.bgRed.white(' 错误 ')} ${chalk.yellow('提交信息格式不正确！')}`);
  console.error(
    `${chalk.blue('正确格式:')} ${chalk.green('type: subject')} ${chalk.yellow('或')} ${chalk.green('type(scope): subject')}`,
  );
  console.error(
    `${chalk.blue('示例:')} ${chalk.green('feat: 添加用户登录功能')} ${chalk.yellow('或')} ${chalk.green('fix(auth): 修复登录验证问题')}`,
  );
  console.error(`${chalk.red('❌ Commitlint 校验失败:')}\n${chalk.yellow(error)}`);
  process.exit(1);
}
