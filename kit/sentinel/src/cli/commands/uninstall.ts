/**
 * sentinel uninstall - 卸载 sentinel workflows
 *
 * 移除 pipeline 文件和 CLAUDE.md 中的 sentinel 段落
 */

import path from 'node:path';
import chalk from 'chalk';
import fse from 'fs-extra';
import type { Command } from 'commander';
import inquirer from 'inquirer';

import type { Platform } from '../../types/index.js';
import {
  VALID_PLATFORMS,
  MARKER_START,
  MARKER_END,
} from '../../types/index.js';
import { createPlatformAdapter } from '../../platform/index.js';
import { pathExists, readFile, writeFile } from '../../utils/file.js';
import { logger } from '../../utils/logger.js';

/**
 * 注册 uninstall 命令
 */
export function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .description('Remove sentinel workflows from target repository')
    .option('--target <path>', 'Target repository directory', process.cwd())
    .option('--platform <platform>', 'CI platform (github)', 'github')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(
      async (options: { target: string; platform: string; yes?: boolean }) => {
        await runUninstall(options);
      },
    );
}

async function runUninstall(options: {
  target: string;
  platform: string;
  yes?: boolean;
}): Promise<void> {
  const target = path.resolve(options.target);
  const platform = options.platform as Platform;

  if (!VALID_PLATFORMS.includes(platform)) {
    logger.error(
      `无效的平台: ${options.platform}\n  支持的平台: ${VALID_PLATFORMS.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const adapter = createPlatformAdapter(platform);
  const pipelineDir = adapter.getPipelineDir(target);

  // 收集要移除的文件
  const filesToRemove: string[] = [];
  for (const file of adapter.getExistingPipelineFiles()) {
    const filePath = path.join(pipelineDir, file);
    if (await pathExists(filePath)) {
      filesToRemove.push(filePath);
    }
  }

  const claudeMdPath = path.join(target, 'CLAUDE.md');
  const claudeMdExists = await pathExists(claudeMdPath);
  let claudeMdHasMarker = false;

  if (claudeMdExists) {
    const content = await readFile(claudeMdPath);
    claudeMdHasMarker =
      content.includes(MARKER_START) && content.includes(MARKER_END);
  }

  if (filesToRemove.length === 0 && !claudeMdHasMarker) {
    logger.info('未发现已安装的 sentinel 组件，无需卸载');
    return;
  }

  // 显示将要移除的内容
  console.log(chalk.bold('将移除以下内容:'));
  for (const file of filesToRemove) {
    console.log(chalk.red(`  - ${file}`));
  }
  if (claudeMdHasMarker) {
    console.log(chalk.red('  - CLAUDE.md 中的 sentinel 规范段落'));
  }
  console.log();

  // 确认
  if (!options.yes) {
    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: '确认卸载?',
        default: false,
      },
    ]);

    if (!confirmed) {
      logger.info('已取消卸载');
      return;
    }
  }

  // 移除 pipeline 文件
  for (const file of filesToRemove) {
    await fse.remove(file);
    logger.success(`已移除: ${file}`);
  }

  // 移除 CLAUDE.md 中的 sentinel 段落
  if (claudeMdHasMarker) {
    const content = await readFile(claudeMdPath);
    const startIdx = content.indexOf(MARKER_START);
    const endIdx = content.indexOf(
      MARKER_END,
      startIdx >= 0 ? startIdx + MARKER_START.length : 0,
    );

    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      logger.warn('CLAUDE.md 中的 sentinel marker 结构异常，跳过移除');
    } else {
      const before = content.slice(0, startIdx).replace(/\n+$/, '');
      const after = content
        .slice(endIdx + MARKER_END.length)
        .replace(/^\n+/, '');

      // 拼接前后内容，处理 before/after 一方为空的边界情况
      let newContent: string;
      if (!before && !after) {
        newContent = '';
      } else if (!before) {
        newContent = after;
      } else if (!after) {
        newContent = before;
      } else {
        newContent = before + '\n\n' + after;
      }

      await writeFile(
        claudeMdPath,
        newContent ? newContent.trimEnd() + '\n' : '',
      );
      logger.success('已移除 CLAUDE.md 中的 sentinel 规范');
    }
  }

  console.log();
  logger.success('卸载完成');
}
