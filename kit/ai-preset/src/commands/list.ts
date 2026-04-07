/**
 * list 命令 — 查看已安装的预设和文件状态
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';

import { logger } from '../utils/logger.js';
import { checkFileStatus, readLockFile } from '../core/lock.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('查看已安装的预设和文件状态')
    .option('--target <dir>', '目标项目目录', process.cwd())
    .action(async (opts: { target: string }) => {
      try {
        await runList(path.resolve(opts.target));
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}

async function runList(projectRoot: string): Promise<void> {
  const lock = await readLockFile(projectRoot);

  if (!lock) {
    logger.warn('未找到 .ai-preset/lock.json，请先运行 ai-preset init');
    return;
  }

  const statusMap = await checkFileStatus(projectRoot, lock);
  const { config } = lock;

  // 预设信息
  console.log();
  console.log(chalk.bold(`📦 AI Preset v${lock.cliVersion}`));
  console.log(
    `  预设: ${['base', config.framework, ...config.domains].filter(Boolean).join(', ')}`,
  );
  console.log(`  平台: ${config.platforms.join(', ')}`);

  if (Object.keys(config.variables).length > 0) {
    console.log(
      `  变量: ${Object.entries(config.variables)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    );
  }

  // 按平台分组文件
  const groups = groupFilesByPlatform(Object.keys(lock.files));

  for (const [platform, files] of Object.entries(groups)) {
    console.log();
    console.log(chalk.bold(`📁 ${platform} (${files.length} files):`));

    for (const file of files) {
      const status = statusMap.get(file) ?? 'managed';
      const icon = getStatusIcon(status);
      console.log(`  ${icon} ${file}  ${chalk.gray(status)}`);
    }
  }

  console.log();
}

function groupFilesByPlatform(files: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  for (const file of files) {
    let platform = 'other';
    if (file.startsWith('.claude/') || file === 'CLAUDE.md') {
      platform = 'Claude Code';
    } else if (file.startsWith('.cursor/')) {
      platform = 'Cursor';
    } else if (file.startsWith('.github/copilot')) {
      platform = 'Copilot';
    } else if (file === 'AGENTS.md') {
      platform = 'Codex';
    } else if (file.startsWith('.windsurf/')) {
      platform = 'Windsurf';
    } else if (file.startsWith('.trae/')) {
      platform = 'Trae';
    } else if (file.startsWith('.ai/') || file.startsWith('.lingma/')) {
      platform = '通义灵码';
    } else if (file.startsWith('.qoder/')) {
      platform = 'Qoder';
    } else if (file.startsWith('.gemini/') || file === 'GEMINI.md') {
      platform = 'Gemini CLI';
    }

    if (!groups[platform]) groups[platform] = [];
    groups[platform]!.push(file);
  }

  return groups;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'managed':
      return chalk.green('✅');
    case 'modified':
      return chalk.yellow('✏️ ');
    case 'ejected':
      return chalk.blue('🔓');
    default:
      return '  ';
  }
}
