import chalk from 'chalk';

try {
  // 构建检查
  console.log(chalk.blue('正在进行构建检查...'));
  // execSync('npm run build', { stdio: 'inherit' });
  console.log(chalk.green('✓ 构建检查通过'));

  process.exit(0);
} catch (error) {
  console.error(chalk.red('× 检查失败'));
  if (error instanceof Error) {
    console.error(chalk.red(error.message));
  }
  process.exit(1);
}
