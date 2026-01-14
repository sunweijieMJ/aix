/**
 * SRT 字幕解析器
 * @description 解析 SRT 格式字幕文件
 *
 * SRT 格式示例:
 * ```
 * 1
 * 00:00:00,000 --> 00:00:05,000
 * 第一句字幕
 *
 * 2
 * 00:00:05,000 --> 00:00:10,000
 * 第二句字幕
 * ```
 */

import type { SubtitleCue, SubtitleParser } from '../types';
import { parseTimelineLine } from './utils';

/**
 * 解析 SRT 字幕内容
 */
export function parseSRT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  let i = 0;

  while (i < lines.length) {
    // 跳过空行
    while (i < lines.length && (lines[i]?.trim() ?? '') === '') {
      i++;
    }

    if (i >= lines.length) break;

    // 读取序号行
    const indexLine = lines[i]?.trim() ?? '';
    if (!/^\d+$/.test(indexLine)) {
      i++;
      continue;
    }

    const cueId = indexLine;
    i++;

    if (i >= lines.length) break;

    // 读取时间戳行
    const timestampLine = lines[i]?.trim() ?? '';
    const timestamps = parseTimelineLine(timestampLine);

    if (!timestamps) {
      i++;
      continue;
    }

    const [startTime, endTime] = timestamps;

    // 收集字幕文本 (可能多行)
    i++;
    const textLines: string[] = [];
    while (i < lines.length && (lines[i]?.trim() ?? '') !== '') {
      textLines.push(lines[i]?.trim() ?? '');
      i++;
    }

    if (textLines.length > 0) {
      cues.push({
        id: cueId,
        startTime,
        endTime,
        text: textLines.join('\n'),
      });
    }
  }

  return cues;
}

/** SRT 解析器 */
export const srtParser: SubtitleParser = {
  parse: parseSRT,
};
