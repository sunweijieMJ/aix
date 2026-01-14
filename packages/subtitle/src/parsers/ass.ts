/**
 * ASS/SSA 字幕解析器
 * @description 解析 ASS/SSA 格式字幕文件，支持提取样式信息
 *
 * ASS 格式示例:
 * ```
 * [Script Info]
 * Title: Example
 *
 * [V4+ Styles]
 * Format: Name, Fontname, Fontsize, ...
 * Style: Default,Arial,20,...
 *
 * [Events]
 * Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
 * Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,第一句字幕
 * Dialogue: 0,0:00:05.00,0:00:10.00,Default,,0,0,0,,第二句字幕
 * ```
 *
 * 特点:
 * - 基于 INI 格式的结构化文件
 * - [Events] 区块包含字幕内容
 * - Dialogue 行包含时间和文本
 * - 时间格式: H:MM:SS.cc (cc 是厘秒，百分之一秒)
 * - 支持解析内联样式标签 {\xxx}
 */

import type { SubtitleCue, SubtitleParser } from '../types';

/** ASS 样式定义 */
export interface AssStyle {
  name: string;
  fontName?: string;
  fontSize?: number;
  primaryColor?: string;
  secondaryColor?: string;
  outlineColor?: string;
  backColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeOut?: boolean;
}

/** ASS 内联样式 */
export interface AssInlineStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeOut?: boolean;
  color?: string;
  fontSize?: number;
}

/**
 * 解析 ASS 时间戳
 * @param timestamp 时间戳字符串，格式: H:MM:SS.cc
 * @returns 秒数
 */
function parseAssTimestamp(timestamp: string): number {
  const parts = timestamp.trim().split(':');

  if (parts.length !== 3) return 0;

  const hours = parseInt(parts[0] ?? '0', 10);
  const minutes = parseInt(parts[1] ?? '0', 10);
  // ASS 使用厘秒 (centiseconds)，即百分之一秒
  const secondsParts = (parts[2] ?? '0').split('.');
  const seconds = parseInt(secondsParts[0] ?? '0', 10);
  const centiseconds = secondsParts[1] ? parseInt(secondsParts[1], 10) : 0;

  return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
}

/**
 * 解析 ASS 颜色值
 * ASS 颜色格式: &HAABBGGRR 或 &HBBGGRR (BGR 顺序)
 * @param colorStr ASS 颜色字符串
 * @returns CSS 颜色值
 */
function parseAssColor(colorStr: string): string | undefined {
  if (!colorStr) return undefined;

  // 移除 &H 前缀和 & 后缀
  const hex = colorStr.replace(/&H?/gi, '').replace(/&$/, '');

  if (hex.length === 6) {
    // BBGGRR -> RGB
    const b = hex.slice(0, 2);
    const g = hex.slice(2, 4);
    const r = hex.slice(4, 6);
    return `#${r}${g}${b}`;
  }

  if (hex.length === 8) {
    // AABBGGRR -> RGBA
    const a = hex.slice(0, 2);
    const b = hex.slice(2, 4);
    const g = hex.slice(4, 6);
    const r = hex.slice(6, 8);
    const alpha = (255 - parseInt(a, 16)) / 255;
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha.toFixed(2)})`;
  }

  return undefined;
}

/**
 * 解析内联样式标签
 * @param text 包含样式标签的文本
 * @returns 内联样式信息
 */
function parseInlineStyles(text: string): AssInlineStyle {
  const style: AssInlineStyle = {};

  // 匹配所有 {\xxx} 标签
  const tagMatches = text.match(/\{[^}]*\}/g) || [];

  for (const tag of tagMatches) {
    const content = tag.slice(1, -1); // 移除 { }

    // 解析 \b (粗体)
    if (/\\b1/.test(content)) style.bold = true;
    if (/\\b0/.test(content)) style.bold = false;

    // 解析 \i (斜体)
    if (/\\i1/.test(content)) style.italic = true;
    if (/\\i0/.test(content)) style.italic = false;

    // 解析 \u (下划线)
    if (/\\u1/.test(content)) style.underline = true;
    if (/\\u0/.test(content)) style.underline = false;

    // 解析 \s (删除线)
    if (/\\s1/.test(content)) style.strikeOut = true;
    if (/\\s0/.test(content)) style.strikeOut = false;

    // 解析 \c 或 \1c (主颜色)
    const colorMatch = content.match(/\\1?c(&H[0-9A-Fa-f]+&?)/);
    if (colorMatch?.[1]) {
      style.color = parseAssColor(colorMatch[1]);
    }

    // 解析 \fs (字体大小)
    const fsMatch = content.match(/\\fs(\d+)/);
    if (fsMatch?.[1]) {
      style.fontSize = parseInt(fsMatch[1], 10);
    }
  }

  return style;
}

/**
 * 清除 ASS 样式标签，返回纯文本
 * @param text 包含样式标签的文本
 * @returns 纯文本
 */
function cleanStyleTags(text: string): string {
  return (
    text
      // 移除 {\xxx} 样式覆盖标签
      .replace(/\{[^}]*\}/g, '')
      // 将 \N 和 \n 转换为换行
      .replace(/\\[Nn]/g, '\n')
      // 移除其他转义字符
      .replace(/\\[hH]/g, ' ')
      .trim()
  );
}

/**
 * 解析 Style 行
 */
function parseStyleLine(line: string, formatOrder: string[]): AssStyle | null {
  const styleStr = line.substring(6).trim(); // 移除 "Style:"
  const parts = styleStr.split(',').map((s) => s.trim());

  if (parts.length < 1) return null;

  const getIndex = (field: string) => formatOrder.indexOf(field.toLowerCase());

  const nameIdx = getIndex('name');
  const fontNameIdx = getIndex('fontname');
  const fontSizeIdx = getIndex('fontsize');
  // 兼容英式 (primarycolour) 和美式 (primarycolor) 拼写
  let primaryColorIdx = getIndex('primarycolour');
  if (primaryColorIdx < 0) {
    primaryColorIdx = getIndex('primarycolor');
  }
  const boldIdx = getIndex('bold');
  const italicIdx = getIndex('italic');
  const underlineIdx = getIndex('underline');
  const strikeOutIdx = getIndex('strikeout');

  const getPart = (idx: number): string | undefined =>
    idx >= 0 ? parts[idx] : undefined;

  return {
    name: getPart(nameIdx >= 0 ? nameIdx : 0) ?? 'Default',
    fontName: getPart(fontNameIdx),
    fontSize:
      fontSizeIdx >= 0 && getPart(fontSizeIdx)
        ? parseInt(getPart(fontSizeIdx)!, 10)
        : undefined,
    primaryColor:
      primaryColorIdx >= 0 && getPart(primaryColorIdx)
        ? parseAssColor(getPart(primaryColorIdx)!)
        : undefined,
    bold:
      boldIdx >= 0
        ? getPart(boldIdx) === '-1' || getPart(boldIdx) === '1'
        : undefined,
    italic:
      italicIdx >= 0
        ? getPart(italicIdx) === '-1' || getPart(italicIdx) === '1'
        : undefined,
    underline:
      underlineIdx >= 0
        ? getPart(underlineIdx) === '-1' || getPart(underlineIdx) === '1'
        : undefined,
    strikeOut:
      strikeOutIdx >= 0
        ? getPart(strikeOutIdx) === '-1' || getPart(strikeOutIdx) === '1'
        : undefined,
  };
}

/**
 * 解析 ASS/SSA 字幕内容
 * @param content ASS 文件内容
 * @param preserveStyles 是否保留样式信息到 data 字段，默认 true
 */
export function parseASS(
  content: string,
  preserveStyles = true,
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const styles: Map<string, AssStyle> = new Map();
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  let currentSection = '';
  let eventsFormatOrder: string[] = [];
  let stylesFormatOrder: string[] = [];
  let cueIndex = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';

    // 检测区块
    if (line.startsWith('[')) {
      currentSection = line.toLowerCase();
      continue;
    }

    // 解析 Styles 区块
    if (currentSection === '[v4+ styles]' || currentSection === '[v4 styles]') {
      if (line.toLowerCase().startsWith('format:')) {
        const formatStr = line.substring(7).trim();
        stylesFormatOrder = formatStr
          .split(',')
          .map((s) => s.trim().toLowerCase());
      } else if (line.toLowerCase().startsWith('style:')) {
        const style = parseStyleLine(line, stylesFormatOrder);
        if (style) {
          styles.set(style.name, style);
        }
      }
      continue;
    }

    // 解析 Events 区块
    if (currentSection !== '[events]') continue;

    // 解析 Format 行，确定字段顺序
    if (line.toLowerCase().startsWith('format:')) {
      const formatStr = line.substring(7).trim();
      eventsFormatOrder = formatStr
        .split(',')
        .map((s) => s.trim().toLowerCase());
      continue;
    }

    // 解析 Dialogue 行
    if (line.toLowerCase().startsWith('dialogue:')) {
      const dialogueStr = line.substring(9).trim();

      // ASS 格式最后一个字段 (Text) 可能包含逗号，所以要特殊处理
      // 前 9 个字段用逗号分隔，第 10 个字段是剩余所有内容
      const parts = dialogueStr.split(',');
      if (parts.length < 10) continue;

      // 默认字段顺序: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
      const startIndex = eventsFormatOrder.indexOf('start');
      const endIndex = eventsFormatOrder.indexOf('end');
      const styleIndex = eventsFormatOrder.indexOf('style');
      const textIndex = eventsFormatOrder.indexOf('text');

      // 如果没有 Format 行，使用默认顺序
      const startPos = startIndex >= 0 ? startIndex : 1;
      const endPos = endIndex >= 0 ? endIndex : 2;
      const stylePos = styleIndex >= 0 ? styleIndex : 3;
      const textPos = textIndex >= 0 ? textIndex : 9;

      const startTime = parseAssTimestamp(parts[startPos] ?? '');
      const endTime = parseAssTimestamp(parts[endPos] ?? '');
      const styleName = parts[stylePos]?.trim() || 'Default';

      // Text 字段是最后一个，可能包含逗号，需要合并
      const rawText = parts.slice(textPos).join(',');
      const text = cleanStyleTags(rawText);

      if (text) {
        const cue: SubtitleCue = {
          id: String(cueIndex++),
          startTime,
          endTime,
          text,
        };

        // 保留样式信息到 data 字段
        if (preserveStyles) {
          const baseStyle = styles.get(styleName);
          const inlineStyle = parseInlineStyles(rawText);

          // 只有存在样式时才添加 data
          if (baseStyle || Object.keys(inlineStyle).length > 0) {
            cue.data = {
              styleName,
              style: baseStyle,
              inlineStyle:
                Object.keys(inlineStyle).length > 0 ? inlineStyle : undefined,
            };
          }
        }

        cues.push(cue);
      }
    }
  }

  // 按开始时间排序（ASS 文件可能不按顺序）
  cues.sort((a, b) => a.startTime - b.startTime);

  return cues;
}

/** ASS 解析器 */
export const assParser: SubtitleParser = {
  parse: parseASS,
};
