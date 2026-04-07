/**
 * upgrade 命令 — 升级预设到最新版本
 *
 * 流程：
 * 1. 读取 lock.json 和 config.json
 * 2. 重新加载最新预设并生成文件
 * 3. 逐文件对比：managed → 直接覆盖，customized → 提示，ejected → 跳过
 * 4. 检测已删除规则并清理
 * 5. 更新 lock
 */

import { createRequire } from 'node:module';
import type { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'node:path';

import type { PlatformOutputFile } from '../types.js';
import { logger } from '../utils/logger.js';
import { existsSync, readFile, readProjectName } from '../utils/fs.js';
import { sha256 } from '../utils/hash.js';
import { readLockFile, buildLockFile, writeLockFile, checkFileStatus } from '../core/lock.js';
import { readConfig, persistedToInitConfig } from '../core/config.js';
import { writeOutputFiles } from '../core/writer.js';
import { createBackup, restoreFromBackup, hasBackup } from '../core/backup.js';
import { generateAllPlatformFiles } from '../core/generator.js';

const req = createRequire(import.meta.url);

export function registerUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('升级预设到最新版本')
    .option('--target <dir>', '目标项目目录', process.cwd())
    .option('--dry-run', '预览模式', false)
    .option('--force', '强制覆盖所有文件（包括 customized）', false)
    .option('--rollback', '从备份恢复上次 upgrade 前的状态', false)
    .action(async (opts) => {
      try {
        await runUpgrade(opts);
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}

interface UpgradeOptions {
  target: string;
  dryRun: boolean;
  force: boolean;
  rollback: boolean;
}

async function runUpgrade(opts: UpgradeOptions): Promise<void> {
  const projectRoot = path.resolve(opts.target);

  // --rollback 模式
  if (opts.rollback) {
    return handleRollback(projectRoot);
  }

  // 读取现有配置
  const lock = await readLockFile(projectRoot);
  if (!lock) {
    throw new Error('未找到 .ai-preset/lock.json，请先运行 ai-preset init');
  }

  const config = await readConfig(projectRoot);
  if (!config) {
    throw new Error('未找到 .ai-preset/config.json，请先运行 ai-preset init');
  }

  const projectName = readProjectName(projectRoot);

  const { initConfig, userConfig } = persistedToInitConfig(config, projectName);

  logger.blank();
  logger.resetSteps();

  // 1. 重新生成最新预设
  logger.step('加载最新预设');
  const allFiles: PlatformOutputFile[] = await generateAllPlatformFiles(initConfig, {
    projectRoot,
    userConfig,
  });

  // 2. 检查当前文件状态
  logger.step('检查文件状态');
  const statusMap = await checkFileStatus(projectRoot, lock);

  // 3. 分类处理
  const toUpdate: PlatformOutputFile[] = [];
  const toSkip: string[] = [];
  const toConfirm: PlatformOutputFile[] = [];

  for (const file of allFiles) {
    const status = statusMap.get(file.relativePath);

    if (!status) {
      // 新文件
      toUpdate.push(file);
      continue;
    }

    switch (status) {
      case 'ejected':
        toSkip.push(file.relativePath);
        break;
      case 'managed': {
        // 检查内容是否有变化
        const absPath = path.join(projectRoot, file.relativePath);
        const currentContent = existsSync(absPath) ? await readFile(absPath) : '';
        if (sha256(currentContent) !== sha256(file.content)) {
          toUpdate.push(file);
        }
        break;
      }
      case 'modified':
        if (opts.force) {
          toUpdate.push(file);
        } else {
          toConfirm.push(file);
        }
        break;
    }
  }

  // 4. 检测已删除的规则
  const newFilePaths = new Set(allFiles.map((f) => f.relativePath));
  const toDelete: string[] = [];
  for (const [filePath, entry] of Object.entries(lock.files)) {
    if (!newFilePaths.has(filePath) && entry.status === 'managed') {
      toDelete.push(filePath);
    }
  }

  // 5. 打印摘要
  logger.step('升级摘要');
  if (toUpdate.length > 0) {
    console.log(chalk.green(`  更新: ${toUpdate.length} 个文件`));
  }
  if (toConfirm.length > 0) {
    console.log(chalk.yellow(`  需确认: ${toConfirm.length} 个文件（已修改）`));
  }
  if (toSkip.length > 0) {
    console.log(chalk.blue(`  跳过: ${toSkip.length} 个文件（ejected）`));
  }
  if (toDelete.length > 0) {
    console.log(chalk.red(`  清理: ${toDelete.length} 个文件（已从预设移除）`));
  }

  if (toUpdate.length === 0 && toConfirm.length === 0 && toDelete.length === 0) {
    logger.success('已是最新，无需更新');
    return;
  }

  // 6. 处理 customized 文件的确认
  const confirmedFiles: PlatformOutputFile[] = [];
  for (const file of toConfirm) {
    if (opts.dryRun) {
      console.log(chalk.yellow(`  [dry-run] 需确认: ${file.relativePath}`));
      continue;
    }

    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: 'select',
        name: 'action',
        message: `${file.relativePath} 已被修改，如何处理?`,
        choices: [
          { name: '保留本地版本', value: 'keep' },
          { name: '使用新版本（覆盖本地修改）', value: 'overwrite' },
        ],
      },
    ]);

    if (action === 'overwrite') {
      confirmedFiles.push(file);
    }
  }

  const finalFiles = [...toUpdate, ...confirmedFiles];

  if (finalFiles.length === 0 && toDelete.length === 0 && toConfirm.length === 0) {
    logger.success('无需更新');
    return;
  }

  // dry-run 模式下只有 toConfirm 文件时，提示后直接返回
  if (opts.dryRun && finalFiles.length === 0 && toDelete.length === 0) {
    logger.blank();
    logger.success(`[dry-run] ${toConfirm.length} 个已修改文件需要确认处理方式`);
    return;
  }

  // 7. 备份
  if (!opts.dryRun && (finalFiles.length > 0 || toDelete.length > 0)) {
    logger.step('备份当前文件');
    const filesToBackup = [...finalFiles.map((f) => f.relativePath), ...toDelete];
    const backedUp = await createBackup(projectRoot, filesToBackup);
    logger.debug(`备份了 ${backedUp} 个文件`);
  }

  // 8. 写入更新
  let writtenFiles: string[] = [];
  if (finalFiles.length > 0) {
    logger.step(`写入 ${finalFiles.length} 个文件`);
    const writeResult = await writeOutputFiles(finalFiles, lock, {
      projectRoot,
      dryRun: opts.dryRun,
    });
    writtenFiles = writeResult.writtenFiles;
  }

  // 9. 清理已删除的文件
  if (toDelete.length > 0 && !opts.dryRun) {
    logger.step(`清理 ${toDelete.length} 个已移除的文件`);
    const fsPromises = await import('node:fs/promises');
    for (const filePath of toDelete) {
      const absPath = path.join(projectRoot, filePath);
      if (existsSync(absPath)) {
        await fsPromises.unlink(absPath);
        logger.debug(`已删除: ${filePath}`);
      }
    }
  }

  // 10. 统一更新 lock（文件写入和删除完成后）
  if (!opts.dryRun && (writtenFiles.length > 0 || toDelete.length > 0)) {
    const { version: cliVersion } = req('../package.json') as {
      version: string;
    };
    const newLock = buildLockFile(
      allFiles,
      { writtenFiles, skippedFiles: [...toSkip] },
      initConfig,
      cliVersion,
      lock,
    );
    await writeLockFile(projectRoot, newLock);
  }

  logger.blank();
  const confirmSuffix =
    opts.dryRun && toConfirm.length > 0 ? `，另有 ${toConfirm.length} 个文件需确认` : '';
  logger.success(
    opts.dryRun
      ? `[dry-run] 将更新 ${finalFiles.length} 个文件，清理 ${toDelete.length} 个文件${confirmSuffix}`
      : `升级完成! 更新 ${finalFiles.length} 个文件，清理 ${toDelete.length} 个文件`,
  );
}

async function handleRollback(projectRoot: string): Promise<void> {
  if (!hasBackup(projectRoot)) {
    throw new Error('没有可用的备份');
  }

  logger.blank();
  logger.step('从备份恢复');
  const restored = await restoreFromBackup(projectRoot);
  logger.blank();
  logger.success(`已恢复 ${restored} 个文件`);
}
