/**
 * SBV 字幕解析器 (YouTube 格式)
 * @description 解析 SBV 格式字幕文件
 *
 * SBV 格式示例:
 * ```
 * 0:00:00.000,0:00:05.000
 * 第一句字幕
 *
 * 0:00:05.000,0:00:10.000
 * 第二句字幕
 * ```
 *
 * 特点:
 * - 无序号行
 * - 时间戳用逗号分隔开始和结束时间
 * - 时间格式: H:MM:SS.mmm
 */

import type { SubtitleCue, SubtitleParser } from '../types';
import { parseTimestamp } from './utils';

/** SBV 时间戳行正则：匹配 H:MM:SS.mmm,H:MM:SS.mmm 格式 */
const SBV_TIMESTAMP_REGEX = /^([\d:.]+)\s*,\s*([\d:.]+)$/;

/**
 * 解析 SBV 字幕内容
 */
export function parseSBV(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  let i = 0;
  let cueIndex = 1;

  while (i < lines.length) {
    // 跳过空行
    while (i < lines.length && (lines[i]?.trim() ?? '') === '') {
      i++;
    }

    if (i >= lines.length) break;

    const line = lines[i]?.trim() ?? '';

    // 检查是否是时间戳行 (格式: H:MM:SS.mmm,H:MM:SS.mmm)
    const timestampMatch = line.match(SBV_TIMESTAMP_REGEX);

    if (!timestampMatch || !timestampMatch[1] || !timestampMatch[2]) {
      i++;
      continue;
    }

    const startTime = parseTimestamp(timestampMatch[1]);
    const endTime = parseTimestamp(timestampMatch[2]);

    // 收集字幕文本 (可能多行)
    i++;
    const textLines: string[] = [];
    while (
      i < lines.length &&
      (lines[i]?.trim() ?? '') !== '' &&
      !SBV_TIMESTAMP_REGEX.test(lines[i]?.trim() ?? '')
    ) {
      textLines.push(lines[i]?.trim() ?? '');
      i++;
    }

    if (textLines.length > 0) {
      cues.push({
        id: String(cueIndex++),
        startTime,
        endTime,
        text: textLines.join('\n'),
      });
    }
  }

  return cues;
}

/** SBV 解析器 */
export const sbvParser: SubtitleParser = {
  parse: parseSBV,
};
