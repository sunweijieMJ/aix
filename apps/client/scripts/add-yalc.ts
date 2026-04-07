#!/usr/bin/env tsx
import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

/**
 * 智能添加 Yalc 链接
 *
 * 功能：
 * 1. 自动保存当前的依赖版本到 .yalc.backup.json
 * 2. 交互式选择要添加的组件包
 * 3. 执行 yalc add
 * 4. 执行 pnpm install
 *
 * 使用：
 * pnpm add:yalc
 */

const BACKUP_FILE = '.yalc.backup.json';
const AIX_ROOT = join(process.cwd(), '../..');
const PACKAGES_DIR = join(AIX_ROOT, 'packages');

interface BackupData {
  timestamp: string;
  dependencies: Record<string, string>;
}

/**
 * 获取所有可用的组件包
 */
function getAvailablePackages(): string[] {
  if (!existsSync(PACKAGES_DIR)) {
    console.error(chalk.red('✗ 未找到 packages 目录'));
    process.exit(1);
  }

  return readdirSync(PACKAGES_DIR).filter((name) => {
    const pkgPath = join(PACKAGES_DIR, name);
    return statSync(pkgPath).isDirectory() && existsSync(join(pkgPath, 'package.json'));
  });
}

/**
 * 保存当前依赖版本
 */
function saveBackup(): void {
  console.log(chalk.cyan('💾 保存依赖版本备份...\n'));

  const pkgPath = join(process.cwd(), 'package.json');

  if (!existsSync(pkgPath)) {
    console.error(chalk.red('✗ 未找到 package.json'));
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  // 提取 @aix/* 依赖
  const aixDeps: Record<string, string> = {};

  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      if (name.startsWith('@aix/') && typeof version === 'string') {
        // 只保存非 file: 协议的依赖（即真实的 npm 包版本）
        if (!version.startsWith('file:')) {
          aixDeps[name] = version;
        }
      }
    }
  }

  if (Object.keys(aixDeps).length === 0) {
    console.log(chalk.gray('  未找到需要备份的 @aix/* 依赖（这是正常的）'));
  } else {
    // 保存备份
    const backup: BackupData = {
      timestamp: new Date().toISOString(),
      dependencies: aixDeps,
    };

    const backupPath = join(process.cwd(), BACKUP_FILE);
    writeFileSync(backupPath, JSON.stringify(backup, null, 2) + '\n');

    console.log(chalk.green('✓ 备份已保存\n'));
    console.log(chalk.gray('已备份的依赖:'));
    for (const [name, version] of Object.entries(aixDeps)) {
      console.log(chalk.gray(`  ${name}: ${version}`));
    }
  }
  console.log();
}

/**
 * 添加 yalc 依赖
 */
async function addYalcDependencies(): Promise<void> {
  const packages = getAvailablePackages();

  if (packages.length === 0) {
    console.error(chalk.red('✗ 未找到可用的组件包'));
    process.exit(1);
  }

  // 交互式选择包
  const { selectedPackages } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedPackages',
      message: '请选择要添加的组件包:',
      choices: [
        { name: '全部', value: 'all' },
        ...packages.map((pkg) => ({ name: `@aix/${pkg}`, value: pkg })),
      ],
      validate: (answer) => {
        if (answer.length === 0) {
          return '请至少选择一个包';
        }
        return true;
      },
    },
  ]);

  // 处理"全部"选项
  const packagesToAdd = selectedPackages.includes('all') ? packages : selectedPackages;

  if (packagesToAdd.length === 0) {
    console.log(chalk.yellow('⚠ 未选择任何包'));
    process.exit(0);
  }

  // 添加 yalc 依赖
  console.log(chalk.cyan('\n📦 添加 yalc 依赖...\n'));

  for (const pkg of packagesToAdd) {
    const pkgName = `@aix/${pkg}`;
    try {
      console.log(chalk.gray(`正在添加 ${pkgName}...`));
      execSync(`yalc add ${pkgName}`, { stdio: 'inherit' });
      console.log(chalk.green(`✓ ${pkgName} 添加成功\n`));
    } catch (error) {
      console.error(chalk.red(`✗ ${pkgName} 添加失败`));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  }

  console.log(chalk.green('✓ 添加完成\n'));

  console.log(chalk.cyan('💡 下一步:'));
  console.log(chalk.gray('  启动 Yalc 模式: pnpm dev:yalc'));
  console.log(chalk.gray('  清理并恢复: pnpm remove:yalc'));
  console.log();
  console.log(chalk.yellow('📝 注意:'));
  console.log(chalk.gray('  yalc 已自动处理依赖链接'));
  console.log(chalk.gray('  如果是外部项目且需要，可手动执行: pnpm install'));
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log(chalk.cyan('🚀 智能添加 Yalc 链接\n'));

  // 检查是否已有 yalc 链接
  const yalcDir = join(process.cwd(), '.yalc');
  if (existsSync(yalcDir)) {
    console.log(chalk.yellow('⚠ 检测到已存在 yalc 链接'));
    const { shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldContinue',
        message: '是否要继续添加（会覆盖现有链接）？',
        default: false,
      },
    ]);

    if (!shouldContinue) {
      console.log(chalk.gray('已取消'));
      process.exit(0);
    }
  }

  // 1. 保存备份
  saveBackup();

  // 2. 添加 yalc 依赖
  await addYalcDependencies();
}

main().catch((error) => {
  console.error(chalk.red('✗ 执行失败'));
  console.error(error);
  process.exit(1);
});
