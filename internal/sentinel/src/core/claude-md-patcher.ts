/**
 * CLAUDE.md 补丁工具
 *
 * 向目标仓库的 CLAUDE.md 注入 Sentinel 规范段落，
 * 使用 marker 注释实现幂等替换。
 */

import path from 'node:path';

import {
  pathExists,
  readFile,
  writeFile,
  readTemplate,
} from '../utils/file.js';
import { MARKER_START, MARKER_END } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * 向目标仓库 CLAUDE.md 注入 Sentinel 规范
 *
 * - 若 CLAUDE.md 不存在，则创建
 * - 若已有 marker 段落，则替换该段落（幂等）
 * - 若无 marker，则追加到文件末尾
 *
 * @returns 是否修改了文件
 */
export async function patchClaudeMd(
  target: string,
  dryRun: boolean,
): Promise<boolean> {
  const claudeMdPath = path.join(target, 'CLAUDE.md');

  // 读取模板内容
  const templateContent = await readTemplate('claude-md/sentinel-rules.md');
  const patchBlock = `${MARKER_START}\n${templateContent}\n${MARKER_END}`;

  // 读取或创建 CLAUDE.md
  let existingContent = '';
  const fileExists = await pathExists(claudeMdPath);

  if (fileExists) {
    existingContent = await readFile(claudeMdPath);
  }

  // 检测并清理孤立 marker（只有 start 没有 end，或反之）
  const hasStart = existingContent.includes(MARKER_START);
  const hasEnd = existingContent.includes(MARKER_END);

  if (hasStart !== hasEnd) {
    logger.warn('CLAUDE.md 中 sentinel marker 不完整，将清理后重新注入');
    existingContent = existingContent
      .replace(MARKER_START, '')
      .replace(MARKER_END, '');
  }

  let newContent: string;

  const startIdx = existingContent.indexOf(MARKER_START);
  const endIdx = existingContent.indexOf(
    MARKER_END,
    startIdx >= 0 ? startIdx + MARKER_START.length : 0,
  );

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // 幂等替换：移除旧内容，插入新内容
    newContent =
      existingContent.slice(0, startIdx) +
      patchBlock +
      existingContent.slice(endIdx + MARKER_END.length);
  } else {
    // 追加到末尾
    newContent = existingContent
      ? `${existingContent.trimEnd()}\n\n${patchBlock}\n`
      : `${patchBlock}\n`;
  }

  // 内容未变化时跳过写入
  if (newContent === existingContent) {
    return false;
  }

  if (dryRun) {
    logger.info(`[dry-run] 将${fileExists ? '更新' : '创建'}: ${claudeMdPath}`);
    return true;
  }

  await writeFile(claudeMdPath, newContent);
  logger.debug(`已${fileExists ? '更新' : '创建'} CLAUDE.md: ${claudeMdPath}`);

  return true;
}
