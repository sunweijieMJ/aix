/**
 * eject 命令 — 将文件标记为 ejected，退出自动升级管理
 *
 * 用法:
 *   ai-preset eject .claude/agents/coding-standards.md
 */

import type { Command } from 'commander';
import path from 'node:path';

import { logger } from '../utils/logger.js';
import { readLockFile, writeLockFile } from '../core/lock.js';

export function registerEjectCommand(program: Command): void {
  program
    .command('eject <file>')
    .description('将文件标记为 ejected，不再参与自动升级')
    .option('--target <dir>', '目标项目目录', process.cwd())
    .action(async (file: string, opts: { target: string }) => {
      try {
        await runEject(file, path.resolve(opts.target));
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}

async function runEject(filePath: string, projectRoot: string): Promise<void> {
  const lock = await readLockFile(projectRoot);
  if (!lock) {
    throw new Error('未找到 .ai-preset/lock.json，请先运行 ai-preset init');
  }

  const entry = lock.files[filePath];
  if (!entry) {
    throw new Error(`文件 "${filePath}" 不在 ai-preset 管理范围内`);
  }

  if (entry.status === 'ejected') {
    logger.warn(`${filePath} 已经是 ejected 状态`);
    return;
  }

  entry.status = 'ejected';
  await writeLockFile(projectRoot, lock);

  logger.success(`${filePath} 已标记为 ejected，后续 upgrade 将跳过此文件`);
}
