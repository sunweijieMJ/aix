/**
 * 字幕解析器统一导出
 * 支持格式: VTT, SRT, JSON, SBV, ASS
 */

import type { SubtitleCue, SubtitleFormat } from '../types';
import { assParser } from './ass';
import { sbvParser } from './sbv';
import { srtParser } from './srt';
import { vttParser } from './vtt';

/** JSON 解析器 */
function parseJSON(content: string): SubtitleCue[] {
  try {
    const data = JSON.parse(content);
    const cues = Array.isArray(data) ? data : data.cues || [];
    const result: SubtitleCue[] = [];

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      // 类型验证：确保必要字段存在且类型正确
      if (
        cue &&
        typeof cue === 'object' &&
        typeof cue.startTime === 'number' &&
        typeof cue.endTime === 'number' &&
        typeof cue.text === 'string'
      ) {
        result.push({
          id: typeof cue.id === 'string' ? cue.id : String(i + 1),
          startTime: cue.startTime,
          endTime: cue.endTime,
          text: cue.text,
          data: cue.data && typeof cue.data === 'object' ? cue.data : undefined,
        });
      } else {
        console.warn(`[Subtitle] JSON 字幕条目 ${i + 1} 格式无效，已跳过`);
      }
    }

    return result;
  } catch {
    console.error('[Subtitle] JSON 解析失败');
    return [];
  }
}

/** 解析器映射 */
const parsers: Record<SubtitleFormat, (content: string) => SubtitleCue[]> = {
  vtt: vttParser.parse,
  srt: srtParser.parse,
  json: parseJSON,
  sbv: sbvParser.parse,
  ass: assParser.parse,
};

/** 扩展名到格式的映射 */
const extToFormat: Record<string, SubtitleFormat> = {
  vtt: 'vtt',
  srt: 'srt',
  json: 'json',
  sbv: 'sbv',
  ass: 'ass',
  ssa: 'ass', // SSA 使用相同解析器
};

/**
 * 根据文件扩展名检测格式
 */
export function detectFormat(filename: string): SubtitleFormat {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return extToFormat[ext] || 'vtt';
}

/**
 * 解析字幕内容
 */
export function parseSubtitle(
  content: string,
  format: SubtitleFormat,
): SubtitleCue[] {
  return parsers[format](content);
}
