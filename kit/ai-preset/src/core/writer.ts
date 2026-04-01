/**
 * 文件写入引擎
 *
 * 负责将适配器输出的文件写入磁盘，处理标记区域替换和状态检查
 */

import path from 'node:path';
import type { LockFile, PlatformOutputFile } from '../types.js';
import { PRESET_MARKER_END, PRESET_MARKER_START } from '../types.js';
import { existsSync, readFile, writeFile } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

export interface WriteOptions {
  projectRoot: string;
  dryRun: boolean;
}

export interface WriteResult {
  /** 成功写入的文件相对路径 */
  writtenFiles: string[];
  /** 因 ejected 跳过的文件相对路径 */
  skippedFiles: string[];
}

/**
 * 将输出文件写入磁盘
 */
export async function writeOutputFiles(
  files: PlatformOutputFile[],
  lockFile: LockFile | null,
  options: WriteOptions,
): Promise<WriteResult> {
  const result: WriteResult = {
    writtenFiles: [],
    skippedFiles: [],
  };

  for (const file of files) {
    const absPath = path.join(options.projectRoot, file.relativePath);

    // 检查 lock 中的状态
    const lockEntry = lockFile?.files[file.relativePath];
    if (lockEntry?.status === 'ejected') {
      logger.debug(`跳过 ejected 文件: ${file.relativePath}`);
      result.skippedFiles.push(file.relativePath);
      continue;
    }

    // 处理入口文件（CLAUDE.md 等）的标记区域替换
    const finalContent = await resolveContent(
      absPath,
      file.content,
      file.relativePath,
    );

    if (options.dryRun) {
      logger.info(`[dry-run] 将写入: ${file.relativePath}`);
      result.writtenFiles.push(file.relativePath);
      continue;
    }

    await writeFile(absPath, finalContent);
    logger.debug(`已写入: ${file.relativePath}`);
    result.writtenFiles.push(file.relativePath);
  }

  return result;
}

/**
 * 处理文件内容：如果是入口文件且已存在，只替换标记区域
 */
async function resolveContent(
  absPath: string,
  newContent: string,
  relativePath: string,
): Promise<string> {
  // 仅对可能有标记区域的入口文件做特殊处理
  const isEntryFile = isMarkerFile(relativePath);
  if (!isEntryFile || !existsSync(absPath)) {
    return newContent;
  }

  const existing = await readFile(absPath);
  const startIdx = existing.indexOf(PRESET_MARKER_START);
  const endIdx = existing.indexOf(PRESET_MARKER_END);

  // 已有标记区域 → 只替换标记之间的内容
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + PRESET_MARKER_END.length);

    // 新内容应包含标记
    if (newContent.includes(PRESET_MARKER_START)) {
      return (
        before +
        newContent.slice(
          newContent.indexOf(PRESET_MARKER_START),
          newContent.indexOf(PRESET_MARKER_END) + PRESET_MARKER_END.length,
        ) +
        after
      );
    }

    return (
      before +
      PRESET_MARKER_START +
      '\n' +
      newContent +
      '\n' +
      PRESET_MARKER_END +
      after
    );
  }

  // 已有文件但无标记 → 追加到末尾
  return (
    existing.trimEnd() +
    '\n\n' +
    PRESET_MARKER_START +
    '\n' +
    newContent +
    '\n' +
    PRESET_MARKER_END +
    '\n'
  );
}

/** 判断是否为可能含标记区域的入口文件 */
function isMarkerFile(relativePath: string): boolean {
  const name = path.basename(relativePath).toUpperCase();
  return (
    name === 'CLAUDE.MD' ||
    name === 'GEMINI.MD' ||
    name === 'AGENTS.MD' ||
    name === 'COPILOT-INSTRUCTIONS.MD' ||
    name === '.CURSORRULES' ||
    name === '.WINDSURFRULES'
  );
}
