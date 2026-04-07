/**
 * restore 命令 — 将 ejected/customized 文件重置为最新预设版本
 *
 * 用法:
 *   ai-preset restore .claude/agents/coding-standards.md
 *   ai-preset restore --all
 */

import type { Command } from 'commander';
import path from 'node:path';

import { logger } from '../utils/logger.js';
import { readProjectName } from '../utils/fs.js';
import { sha256 } from '../utils/hash.js';
import { readLockFile, writeLockFile } from '../core/lock.js';
import { readConfig, persistedToInitConfig } from '../core/config.js';
import { writeOutputFiles } from '../core/writer.js';
import { generateAllPlatformFiles } from '../core/generator.js';
import type { PlatformOutputFile } from '../types.js';

export function registerRestoreCommand(program: Command): void {
  program
    .command('restore [file]')
    .description('将 ejected/customized 文件重置为预设版本')
    .option('--all', '恢复所有非 managed 状态的文件', false)
    .option('--target <dir>', '目标项目目录', process.cwd())
    .option('--dry-run', '预览模式', false)
    .action(async (file: string | undefined, opts) => {
      try {
        await runRestore(file, opts);
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}

interface RestoreOptions {
  all: boolean;
  target: string;
  dryRun: boolean;
}

async function runRestore(filePath: string | undefined, opts: RestoreOptions): Promise<void> {
  const projectRoot = path.resolve(opts.target);

  const lock = await readLockFile(projectRoot);
  if (!lock) {
    throw new Error('未找到 .ai-preset/lock.json，请先运行 ai-preset init');
  }

  const config = await readConfig(projectRoot);
  if (!config) {
    throw new Error('未找到 .ai-preset/config.json');
  }

  // 确定要恢复的文件
  let filesToRestore: string[];
  if (opts.all) {
    filesToRestore = Object.entries(lock.files)
      .filter(([, entry]) => entry.status !== 'managed')
      .map(([p]) => p);
  } else if (filePath) {
    if (!lock.files[filePath]) {
      throw new Error(`文件 "${filePath}" 不在 ai-preset 管理范围内`);
    }
    filesToRestore = [filePath];
  } else {
    throw new Error('请指定文件路径或使用 --all');
  }

  if (filesToRestore.length === 0) {
    logger.info('没有需要恢复的文件');
    return;
  }

  logger.info(`将恢复 ${filesToRestore.length} 个文件`);

  const projectName = readProjectName(projectRoot);

  const { initConfig, userConfig } = persistedToInitConfig(config, projectName);

  // 生成所有文件内容
  const allFiles: PlatformOutputFile[] = await generateAllPlatformFiles(initConfig, {
    projectRoot,
    userConfig,
  });

  // 过滤出需要恢复的文件
  const restoreSet = new Set(filesToRestore);
  const filesToWrite = allFiles.filter((f) => restoreSet.has(f.relativePath));

  if (filesToWrite.length === 0) {
    logger.warn('指定的文件在当前预设中不存在');
    return;
  }

  // 临时将 lock 中这些文件的 status 改为 managed，允许 writer 覆盖
  const tempLock = structuredClone(lock);
  for (const fp of filesToRestore) {
    if (tempLock.files[fp]) {
      tempLock.files[fp]!.status = 'managed';
    }
  }

  const writeResult = await writeOutputFiles(filesToWrite, tempLock, {
    projectRoot,
    dryRun: opts.dryRun,
  });

  // 更新 lock 中的状态和 hash
  if (!opts.dryRun) {
    for (const fp of writeResult.writtenFiles) {
      const file = filesToWrite.find((f) => f.relativePath === fp);
      if (file && lock.files[fp]) {
        lock.files[fp]!.status = 'managed';
        lock.files[fp]!.hash = sha256(file.content);
        lock.files[fp]!.generatedAt = new Date().toISOString();
      }
    }
    await writeLockFile(projectRoot, lock);
  }

  logger.blank();
  logger.success(
    opts.dryRun
      ? `[dry-run] 将恢复 ${filesToWrite.length} 个文件`
      : `已恢复 ${writeResult.writtenFiles.length} 个文件为预设版本`,
  );
}
