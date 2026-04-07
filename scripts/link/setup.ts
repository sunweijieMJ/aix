import { execSync } from 'child_process';
import chalk from 'chalk';

/**
 * 检查并安装 yalc
 * 用于本地包联调
 */

console.log(chalk.cyan('🔗 检查本地联调环境...\n'));

// 检查版本函数
function checkVersion(command: string, minVersion: string, name: string): boolean {
  try {
    const version = execSync(command, { encoding: 'utf-8' }).trim();
    console.log(chalk.green(`✓ ${name}: ${version}`));
    return true;
  } catch {
    console.log(chalk.yellow(`⚠ ${name} 未安装或版本不符合要求 (需要 >= ${minVersion})`));
    return false;
  }
}

// 检查必要的工具版本
console.log(chalk.cyan('检查工具版本:\n'));
checkVersion('node --version', '22.0.0', 'Node.js');
checkVersion('pnpm --version', '10.0.0', 'pnpm');
console.log();

try {
  // 检查是否已安装 yalc
  execSync('yalc --version', { stdio: 'pipe' });
  console.log(chalk.green('✓ yalc 已安装'));
} catch {
  console.log(chalk.yellow('⚠ 未检测到 yalc，正在安装...\n'));

  try {
    execSync('npm install -g yalc', { stdio: 'inherit' });
    console.log(chalk.green('\n✓ yalc 安装成功\n'));
  } catch {
    console.error(chalk.red('✗ yalc 安装失败'));
    console.error(chalk.yellow('请手动执行: npm install -g yalc'));
    process.exit(1);
  }
}

console.log(chalk.cyan('\n📖 使用指南:\n'));
console.log('  开发模式 (源码联调):');
console.log(chalk.gray('    1. 在业务项目中配置 vite.config.ts alias'));
console.log(chalk.gray('    2. 参考 apps/example/vite.config.ts\n'));

console.log('  测试模式 (打包产物联调):');
console.log(chalk.gray('    1. 执行 pnpm build:watch (监听模式构建)'));
console.log(chalk.gray('    2. 执行 pnpm link:publish (发布到 yalc)'));
console.log(chalk.gray('    3. 在业务项目执行 yalc add @aix/button'));
console.log(chalk.gray('    4. 更新后执行 pnpm link:push\n'));

console.log(chalk.green('✓ 环境检查完成\n'));
