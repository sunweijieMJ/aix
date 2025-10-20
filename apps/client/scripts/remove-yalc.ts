#!/usr/bin/env tsx
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

/**
 * 智能删除 Yalc 链接
 *
 * 功能：
 * 1. 检查 .yalc.backup.json 备份文件
 * 2. 清理 yalc 链接
 * 3. 恢复原始依赖版本（如果存在）
 * 4. 删除备份文件
 *
 * 使用场景：
 * - 外部业务项目：从 yalc 模式切换回 npm 包
 * - example 项目：从 yalc 模式切换回源码模式
 *
 * 使用：
 * pnpm remove:yalc
 */

const BACKUP_FILE = '.yalc.backup.json';

interface BackupData {
  timestamp: string;
  dependencies: Record<string, string>;
}

console.log(chalk.cyan('🧹 智能删除 Yalc 链接...\n'));

// 检查是否存在 .yalc 目录
const yalcDir = join(process.cwd(), '.yalc');
const hasYalc = existsSync(yalcDir);

if (!hasYalc) {
  console.log(chalk.yellow('⚠ 未检测到 yalc 链接'));
  process.exit(0);
}

// 读取 package.json
const pkgPath = join(process.cwd(), 'package.json');

// 读取备份文件（如果存在）
const backupPath = join(process.cwd(), BACKUP_FILE);
let backup: BackupData | null = null;

if (existsSync(backupPath)) {
  try {
    backup = JSON.parse(readFileSync(backupPath, 'utf-8'));
    console.log(chalk.green(`✓ 找到备份文件 (${backup?.timestamp})`));
  } catch (error) {
    console.log(chalk.yellow('⚠ 备份文件损坏，将忽略', error));
  }
}

try {
  // 清理所有 yalc 链接
  console.log(chalk.gray('正在移除 yalc 链接...'));
  execSync('yalc remove --all', { stdio: 'inherit' });
  console.log(chalk.green('✓ yalc 链接已移除\n'));

  // 如果有备份，恢复原始依赖
  if (backup && Object.keys(backup.dependencies).length > 0) {
    console.log(chalk.cyan('正在恢复原始依赖版本...'));

    const pkgUpdated = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    // 恢复依赖版本
    for (const [name, version] of Object.entries(backup.dependencies)) {
      if (pkgUpdated.dependencies) {
        pkgUpdated.dependencies[name] = version;
      }
      console.log(chalk.gray(`  ${name}: ${version}`));
    }

    // 写回 package.json
    writeFileSync(pkgPath, JSON.stringify(pkgUpdated, null, 2) + '\n');
    console.log(chalk.green('✓ 原始依赖版本已恢复\n'));
  }

  // 删除备份文件
  if (existsSync(backupPath)) {
    execSync(`rm ${backupPath}`);
  }

  console.log(chalk.green('✓ 清理完成\n'));

  if (backup && Object.keys(backup.dependencies).length > 0) {
    console.log(chalk.cyan('💡 提示:'));
    console.log(chalk.gray('  已恢复到原始 npm 包版本'));
  } else {
    console.log(chalk.cyan('💡 提示:'));
    console.log(chalk.gray('  如需重新使用 yalc，请执行:'));
    console.log(chalk.gray('  pnpm add:yalc'));
  }
} catch (error) {
  console.error(chalk.red('✗ 清理失败'));
  if (error instanceof Error) {
    console.error(chalk.red(error.message));
  }
  process.exit(1);
}
