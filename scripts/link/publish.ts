import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

/**
 * 发布组件库包到 yalc 本地仓库
 * 支持选择发布单个或全部包
 */

const PACKAGES_DIR = join(process.cwd(), 'packages');

// 获取所有组件包
function getPackages(): string[] {
  return readdirSync(PACKAGES_DIR).filter((name) => {
    const pkgPath = join(PACKAGES_DIR, name);
    return (
      statSync(pkgPath).isDirectory() &&
      existsSync(join(pkgPath, 'package.json'))
    );
  });
}

// 检查包是否已构建
function isPackageBuilt(pkgName: string): boolean {
  const pkgPath = join(PACKAGES_DIR, pkgName);
  return existsSync(join(pkgPath, 'es')) || existsSync(join(pkgPath, 'lib'));
}

// 发布单个包
function publishPackage(pkgName: string): void {
  const pkgPath = join(PACKAGES_DIR, pkgName);

  console.log(chalk.cyan(`\n📦 发布 ${pkgName}...`));

  if (!isPackageBuilt(pkgName)) {
    console.log(chalk.yellow(`⚠ ${pkgName} 未构建，正在构建...`));
    try {
      execSync(`cd ${pkgPath} && pnpm build`, { stdio: 'inherit' });
    } catch {
      console.error(chalk.red(`✗ ${pkgName} 构建失败`));
      return;
    }
  }

  try {
    execSync(`cd ${pkgPath} && yalc publish`, { stdio: 'inherit' });
    console.log(chalk.green(`✓ ${pkgName} 发布成功`));
  } catch {
    console.error(chalk.red(`✗ ${pkgName} 发布失败`));
  }
}

// 主函数
async function main() {
  console.log(chalk.cyan('🚀 Yalc 发布工具\n'));

  const packages = getPackages();

  if (packages.length === 0) {
    console.error(chalk.red('未找到任何包'));
    process.exit(1);
  }

  const { selectedPackages } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedPackages',
      message: '请选择要发布的包:',
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

  const packagesToPublish = selectedPackages.includes('__all__')
    ? packages
    : selectedPackages;

  console.log(chalk.cyan(`\n将发布 ${packagesToPublish.length} 个包\n`));

  for (const pkg of packagesToPublish) {
    publishPackage(pkg);
  }

  console.log(chalk.green('\n✓ 发布完成\n'));
  console.log(chalk.cyan('📖 下一步:\n'));
  console.log(chalk.gray('  在业务项目中执行:'));
  console.log(
    chalk.gray(
      `    yalc add ${packagesToPublish.map((p: string) => `@aix/${p}`).join(' ')}\n`,
    ),
  );
}

main().catch(console.error);
