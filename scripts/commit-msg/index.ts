import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import chalk from 'chalk';

// 获取提交信息
const COMMIT_MESSAGE_FILE = process.argv[2];
if (!COMMIT_MESSAGE_FILE) {
  console.error(chalk.red('❌ 没有提供 commit message 文件路径'));
  process.exit(1);
}
const COMMIT_MESSAGE = fs.readFileSync(COMMIT_MESSAGE_FILE, 'utf8');

// 定义正则
const COMMIT_REGEXP =
  /^\[(AI|Human)\]\[(feat|fix|docs|style|refactor|perf|test|workflow|build|ci|chore|release)\]: .{1,100}/;

if (!COMMIT_REGEXP.test(COMMIT_MESSAGE)) {
  console.error(
    `${chalk.bgRed.white(' 错误 ')} ${chalk.yellow('请使用')} ${chalk.green('yarn commit')} ${chalk.yellow('来提交代码！')}`,
  );
  process.exit(1);
}

// cspell校验
try {
  const result = spawnSync('npx', ['--no-install', 'cspell', 'stdin'], {
    input: COMMIT_MESSAGE,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
    shell: true, // Required for Windows to find npx
  });

  if (result.status !== 0) {
    console.error(
      `${chalk.red('❌ 拼写检查失败')}\n${chalk.yellow('请修正提交信息中的拼写错误。')}`,
    );
    process.exit(1);
  }
  console.log(chalk.green('✅ Cspell 拼写检查通过'));
} catch (error) {
  console.error(`${chalk.red('❌ 拼写检查失败:')} ${chalk.yellow(error)}`);
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
}
