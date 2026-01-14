/**
 * WebVTT 字幕解析器
 * @description 解析 VTT 格式字幕文件
 *
 * VTT 格式示例:
 * ```
 * WEBVTT
 *
 * 00:00:00.000 --> 00:00:05.000
 * 第一句字幕
 *
 * 00:00:05.000 --> 00:00:10.000
 * 第二句字幕
 * ```
 */

import type { SubtitleCue, SubtitleParser } from '../types';
import { parseTimelineLine } from './utils';

/**
 * 解析 VTT 字幕内容
 */
export function parseVTT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  let i = 0;

  // 跳过 WEBVTT 头部和注释
  while (i < lines.length) {
    const line = lines[i]?.trim() ?? '';
    if (line === '' || line.startsWith('WEBVTT') || line.startsWith('NOTE')) {
      i++;
      continue;
    }
    break;
  }

  // 解析字幕块
  while (i < lines.length) {
    const line = lines[i]?.trim() ?? '';

    // 跳过空行
    if (line === '') {
      i++;
      continue;
    }

    // 检查是否是时间戳行
    let timestampLine = line;
    let cueId: string | undefined;

    // 如果不包含 -->, 可能是 cue ID
    if (!line.includes('-->')) {
      cueId = line;
      i++;
      if (i >= lines.length) break;
      timestampLine = lines[i]?.trim() ?? '';
    }

    // 解析时间戳
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

/** VTT 解析器 */
export const vttParser: SubtitleParser = {
  parse: parseVTT,
};
