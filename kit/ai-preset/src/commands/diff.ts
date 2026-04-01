/**
 * diff 命令 — 查看本地修改与预设版本的差异
 *
 * 用法:
 *   ai-preset diff                              # 查看所有修改
 *   ai-preset diff .claude/agents/coding.md     # 查看特定文件
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { logger } from '../utils/logger.js';
import { existsSync, readFile, readProjectName } from '../utils/fs.js';
import { readLockFile, checkFileStatus } from '../core/lock.js';
import { readConfig, persistedToInitConfig } from '../core/config.js';
import { generateAllPlatformFiles } from '../core/generator.js';

export function registerDiffCommand(program: Command): void {
  program
    .command('diff [file]')
    .description('查看本地修改与预设版本的差异')
    .option('--target <dir>', '目标项目目录', process.cwd())
    .action(async (file: string | undefined, opts: { target: string }) => {
      try {
        await runDiff(file, path.resolve(opts.target));
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}

async function runDiff(
  filePath: string | undefined,
  projectRoot: string,
): Promise<void> {
  const lock = await readLockFile(projectRoot);
  if (!lock) {
    throw new Error('未找到 .ai-preset/lock.json，请先运行 ai-preset init');
  }

  const config = await readConfig(projectRoot);
  if (!config) {
    throw new Error('未找到 .ai-preset/config.json');
  }

  // 确定要对比的文件
  const statusMap = await checkFileStatus(projectRoot, lock);
  let filesToDiff: string[];

  if (filePath) {
    if (!lock.files[filePath]) {
      throw new Error(`文件 "${filePath}" 不在 ai-preset 管理范围内`);
    }
    filesToDiff = [filePath];
  } else {
    // 只对比 modified 状态的文件
    filesToDiff = [...statusMap.entries()]
      .filter(([, status]) => status === 'modified')
      .map(([p]) => p);
  }

  if (filesToDiff.length === 0) {
    logger.success('所有文件与预设版本一致，无差异');
    return;
  }

  const projectName = readProjectName(projectRoot);

  const { initConfig, userConfig } = persistedToInitConfig(config, projectName);

  // 生成各平台预设文件
  const allFiles = await generateAllPlatformFiles(initConfig, {
    projectRoot,
    userConfig,
  });
  const presetFiles = new Map<string, string>();
  for (const f of allFiles) {
    presetFiles.set(f.relativePath, f.content);
  }

  // 输出差异
  let hasDiff = false;
  for (const fp of filesToDiff) {
    const presetContent = presetFiles.get(fp);
    if (!presetContent) continue;

    const absPath = path.join(projectRoot, fp);
    if (!existsSync(absPath)) {
      console.log(chalk.red(`--- ${fp} (已删除)`));
      hasDiff = true;
      continue;
    }

    const localContent = await readFile(absPath);
    if (localContent === presetContent) continue;

    const patch = createTwoFilesPatch(
      `preset/${fp}`,
      `local/${fp}`,
      presetContent,
      localContent,
      '预设版本',
      '本地版本',
    );

    hasDiff = true;
    console.log();
    // 彩色输出 diff
    for (const line of patch.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) {
        console.log(chalk.bold(line));
      } else if (line.startsWith('+')) {
        console.log(chalk.green(line));
      } else if (line.startsWith('-')) {
        console.log(chalk.red(line));
      } else if (line.startsWith('@@')) {
        console.log(chalk.cyan(line));
      } else {
        console.log(line);
      }
    }
  }

  if (!hasDiff) {
    logger.success('指定文件与预设版本一致');
  }
}
