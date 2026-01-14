/**
 * 字幕解析器公共工具函数
 */

/**
 * 解析时间戳为秒数
 * 支持格式:
 * - HH:MM:SS.mmm (VTT)
 * - HH:MM:SS,mmm (SRT)
 * - MM:SS.mmm (VTT 简写)
 *
 * @param timestamp 时间戳字符串
 * @returns 秒数
 */
export function parseTimestamp(timestamp: string): number {
  // 统一将逗号转换为点号 (SRT 格式使用逗号)
  const normalized = timestamp.trim().replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length === 3) {
    // HH:MM:SS.mmm
    const hours = parseInt(parts[0] ?? '0', 10);
    const minutes = parseInt(parts[1] ?? '0', 10);
    const seconds = parseFloat(parts[2] ?? '0');
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    // MM:SS.mmm (VTT 简写格式)
    const minutes = parseInt(parts[0] ?? '0', 10);
    const seconds = parseFloat(parts[1] ?? '0');
    return minutes * 60 + seconds;
  }

  return 0;
}

/**
 * 解析时间轴行
 * 支持格式:
 * - 00:00:00.000 --> 00:00:05.000 (VTT)
 * - 00:00:00,000 --> 00:00:05,000 (SRT)
 *
 * @param line 时间轴行
 * @returns [startTime, endTime] 或 null
 */
export function parseTimelineLine(line: string): [number, number] | null {
  const match = line.match(/^([\d:.,]+)\s*-->\s*([\d:.,]+)/);
  if (!match || !match[1] || !match[2]) return null;

  const startTime = parseTimestamp(match[1]);
  const endTime = parseTimestamp(match[2]);
  return [startTime, endTime];
}
