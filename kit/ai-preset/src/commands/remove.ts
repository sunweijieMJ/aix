/**
 * remove 命令 — 移除模块或平台
 *
 * 用法:
 *   ai-preset remove mobile           # 移除领域模块
 *   ai-preset remove --platform cursor # 移除平台
 */

import { createRequire } from 'node:module';
import type { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs/promises';

import type { AIPlatform } from '../types.js';
import { logger } from '../utils/logger.js';
import { existsSync, readProjectName } from '../utils/fs.js';
import { readConfig, writeConfig, persistedToInitConfig } from '../core/config.js';
import { readLockFile, buildLockFile, writeLockFile } from '../core/lock.js';
import { writeOutputFiles } from '../core/writer.js';
import { generateAllPlatformFiles } from '../core/generator.js';

const req = createRequire(import.meta.url);

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove [module]')
    .description('移除领域模块或平台')
    .option('--platform <name>', '移除 AI 平台')
    .option('--target <dir>', '目标项目目录', process.cwd())
    .option('--dry-run', '预览模式', false)
    .action(async (module: string | undefined, opts) => {
      try {
        await runRemove(module, opts);
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}

interface RemoveOptions {
  platform?: string;
  target: string;
  dryRun: boolean;
}

async function runRemove(moduleName: string | undefined, opts: RemoveOptions): Promise<void> {
  const projectRoot = path.resolve(opts.target);

  const config = await readConfig(projectRoot);
  if (!config) {
    throw new Error('未找到 .ai-preset/config.json，请先运行 ai-preset init');
  }

  const lock = await readLockFile(projectRoot);
  if (!lock) {
    throw new Error('未找到 .ai-preset/lock.json，请先运行 ai-preset init');
  }

  // 记录旧文件列表（用于对比删除）
  const oldFilePaths = new Set(Object.keys(lock.files));

  let changed = false;

  // 移除平台
  if (opts.platform) {
    const platform = opts.platform as AIPlatform;
    const idx = config.platforms.indexOf(platform);
    if (idx === -1) {
      logger.warn(`平台 ${platform} 未安装`);
    } else {
      if (config.platforms.length <= 1) {
        throw new Error('至少保留一个平台');
      }
      config.platforms.splice(idx, 1);
      changed = true;
      logger.info(`移除平台: ${platform}`);
    }
  }

  // 移除领域模块
  if (moduleName) {
    const domainIdx = config.domains.indexOf(moduleName);
    if (domainIdx === -1) {
      logger.warn(`模块 ${moduleName} 未安装`);
    } else {
      config.domains.splice(domainIdx, 1);
      changed = true;
      logger.info(`移除模块: ${moduleName}`);
    }
  }

  if (!changed) {
    logger.info('无变更');
    return;
  }

  // 重新生成（不含被移除的模块/平台）
  logger.blank();
  logger.resetSteps();

  const projectName = readProjectName(projectRoot);

  const { initConfig, userConfig } = persistedToInitConfig(config, projectName);

  logger.step('重新生成文件');
  const allFiles = await generateAllPlatformFiles(initConfig, {
    projectRoot,
    userConfig,
  });

  logger.step(`写入 ${allFiles.length} 个文件`);
  const writeResult = await writeOutputFiles(allFiles, lock, {
    projectRoot,
    dryRun: opts.dryRun,
  });

  // 清理不再需要的文件
  const newFilePaths = new Set(allFiles.map((f) => f.relativePath));
  const toDelete: string[] = [];
  for (const oldPath of oldFilePaths) {
    if (!newFilePaths.has(oldPath)) {
      const entry = lock.files[oldPath];
      if (entry?.status === 'managed') {
        toDelete.push(oldPath);
      }
    }
  }

  if (toDelete.length > 0) {
    if (opts.dryRun) {
      logger.step(`[dry-run] 将清理 ${toDelete.length} 个文件`);
      for (const filePath of toDelete) {
        logger.info(`  [dry-run] 将删除: ${filePath}`);
      }
    } else {
      logger.step(`清理 ${toDelete.length} 个文件`);
      for (const filePath of toDelete) {
        const absPath = path.join(projectRoot, filePath);
        if (existsSync(absPath)) {
          await fs.unlink(absPath);
          logger.debug(`已删除: ${filePath}`);
        }
      }
    }
  }

  if (!opts.dryRun) {
    const { version: cliVersion } = req('../package.json') as {
      version: string;
    };
    const newLock = buildLockFile(allFiles, writeResult, initConfig, cliVersion, lock);
    await writeLockFile(projectRoot, newLock);
    await writeConfig(projectRoot, config);
    logger.step('更新配置');
  }

  logger.blank();
  const summary =
    `更新 ${writeResult.writtenFiles.length} 个文件` +
    (toDelete.length > 0 ? `，清理 ${toDelete.length} 个文件` : '');
  logger.success(opts.dryRun ? `[dry-run] 将${summary}` : `完成! ${summary}`);
}
