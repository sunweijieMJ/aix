import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

/**
 * 推送更新到已链接的业务项目
 * 用于开发时快速同步修改
 */

const PACKAGES_DIR = join(process.cwd(), 'packages');

// 获取所有组件包
function getPackages(): string[] {
  return readdirSync(PACKAGES_DIR).filter((name) => {
    const pkgPath = join(PACKAGES_DIR, name);
    return statSync(pkgPath).isDirectory() && existsSync(join(pkgPath, 'package.json'));
  });
}

// 推送单个包
function pushPackage(pkgName: string): void {
  const pkgPath = join(PACKAGES_DIR, pkgName);

  console.log(chalk.cyan(`\n🔄 推送 ${pkgName}...`));

  try {
    // 先重新构建
    console.log(chalk.gray(`  构建中...`));
    execSync(`cd ${pkgPath} && pnpm build`, { stdio: 'inherit' });

    // 推送到所有链接的项目
    execSync(`cd ${pkgPath} && yalc push`, { stdio: 'inherit' });
    console.log(chalk.green(`✓ ${pkgName} 推送成功`));
  } catch (error) {
    console.error(chalk.red(`✗ ${pkgName} 推送失败`));
    if (error instanceof Error && error.message) {
      console.error(chalk.red(`  错误: ${error.message}`));
    }
  }
}

// 主函数
async function main() {
  console.log(chalk.cyan('🔄 Yalc 推送工具\n'));

  const packages = getPackages();

  if (packages.length === 0) {
    console.error(chalk.red('未找到任何包'));
    process.exit(1);
  }

  const { selectedPackages } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedPackages',
      message: '请选择要推送的包:',
      choices: [
        { name: '全部', value: '__all__' },
        ...packages.map((pkg) => ({
          name: `@aix/${pkg}`,
          value: pkg,
          checked: false,
        })),
      ],
    },
  ]);

  if (selectedPackages.length === 0) {
    console.log(chalk.yellow('未选择任何包'));
    return;
  }

  const packagesToPush = selectedPackages.includes('__all__') ? packages : selectedPackages;

  console.log(chalk.cyan(`\n将推送 ${packagesToPush.length} 个包\n`));

  for (const pkg of packagesToPush) {
    pushPackage(pkg);
  }

  console.log(chalk.green('\n✓ 推送完成\n'));
  console.log(chalk.gray('已链接的业务项目会自动更新'));
}

main().catch(console.error);
