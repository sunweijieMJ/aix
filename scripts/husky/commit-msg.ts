import { execSync } from 'child_process';
import fs from 'fs';
import chalk from 'chalk';

// 获取提交信息
const COMMIT_MESSAGE_FILE = process.argv[2];
if (!COMMIT_MESSAGE_FILE) {
  console.error(chalk.red('❌ 没有提供 commit message 文件路径'));
  process.exit(1);
}
const COMMIT_MESSAGE = fs.readFileSync(COMMIT_MESSAGE_FILE, 'utf8');

// 定义正则 - 标准 conventional commits 格式: type(scope): subject 或 type: subject
const COMMIT_REGEXP =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,100}/;

if (!COMMIT_REGEXP.test(COMMIT_MESSAGE)) {
  console.error(
    `${chalk.bgRed.white(' 错误 ')} ${chalk.yellow('提交信息格式不正确！')}`,
  );
  console.error(
    `${chalk.blue('正确格式:')} ${chalk.green('type: subject')} ${chalk.yellow('或')} ${chalk.green('type(scope): subject')}`,
  );
  console.error(
    `${chalk.blue('示例:')} ${chalk.green('feat: 添加用户登录功能')} ${chalk.yellow('或')} ${chalk.green('fix(auth): 修复登录验证问题')}`,
  );
  process.exit(1);
}

// commitlint校验
try {
  execSync(`npx --no-install commitlint --edit ${COMMIT_MESSAGE_FILE}`);
  console.log(chalk.green('✅ Commitlint 检查通过'));
} catch (error) {
  console.error(
    `${chalk.red('❌ Commitlint 校验失败:')}\n${chalk.yellow(error)}\n${chalk.blue('提示：请确保提交信息符合规范格式')}`,
  );
  process.exit(1);
}
