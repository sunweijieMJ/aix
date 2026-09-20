/**
 * 以二级标题切分的 Markdown 段操作。
 *
 * README 与文档页的 `## API` 段都是机器所有区，替换边界统一在这里定义：
 * 从匹配的二级标题起，到下一个二级标题（或文末）止。围栏代码块里的 `## ` 行不算标题。
 */

/** API 段标题。`## API 参考` 这种带后缀的写法也算 */
export const API_HEADING_RE = /^## API\b.*$/m;

/** 类型定义段标题，只认精确的 `## 类型定义` */
export const TYPES_HEADING_RE = /^## 类型定义[ \t]*\r?$/m;

const NEXT_H2_RE = /^## /m;

const FENCE_RE = /^(`{3,}|~{3,})/;

/** 围栏代码块覆盖的 [start, end) 字符区间；没有收尾的围栏不算代码块 */
function fencedRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let offset = 0;
  let openAt: number | null = null;
  let openMarker = '';

  for (const line of content.split('\n')) {
    const match = FENCE_RE.exec(line);
    if (match) {
      const marker = match[1]!;
      if (openAt === null) {
        openAt = offset;
        openMarker = marker;
      } else if (marker[0] === openMarker[0] && marker.length >= openMarker.length) {
        ranges.push([openAt, offset + line.length]);
        openAt = null;
      }
    }
    offset += line.length + 1;
  }
  return ranges;
}

/** 从 from 起找第一个不在围栏里的匹配，返回其在 content 中的绝对位置 */
function findHeading(
  content: string,
  headingRe: RegExp,
  from: number,
  fences: Array<[number, number]>,
): { index: number; length: number } | null {
  const re = new RegExp(
    headingRe.source,
    headingRe.flags.includes('g') ? headingRe.flags : headingRe.flags + 'g',
  );
  re.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const index = match.index;
    if (!fences.some(([start, end]) => index >= start && index < end)) {
      return { index, length: match[0].length };
    }
    if (match[0].length === 0) re.lastIndex++;
  }
  return null;
}

/**
 * 取出一段（含标题，去掉首尾空白）；没有该段返回 null
 */
export function extractSection(content: string, headingRe: RegExp): string | null {
  const fences = fencedRanges(content);
  const start = findHeading(content, headingRe, 0, fences);
  if (!start) return null;

  const bodyStart = start.index + start.length;
  const next = findHeading(content, NEXT_H2_RE, bodyStart, fences);
  const end = next ? next.index : content.length;

  return content.slice(start.index, end).trim();
}

/**
 * 用 `section`（含标题）整段替换；没有该段时追加到文末。
 * 替换后与后一个二级标题之间恰好保留一个空行。
 */
export function replaceSection(content: string, headingRe: RegExp, section: string): string {
  const normalized = section.trim() + '\n';
  const fences = fencedRanges(content);
  const start = findHeading(content, headingRe, 0, fences);

  if (!start) {
    return content.trimEnd() + '\n\n' + normalized;
  }

  const bodyStart = start.index + start.length;
  const next = findHeading(content, NEXT_H2_RE, bodyStart, fences);

  if (!next) {
    return content.slice(0, start.index) + normalized;
  }

  return content.slice(0, start.index) + normalized + '\n' + content.slice(next.index);
}

/**
 * 去掉段首的二级标题，只留正文
 */
export function stripHeading(section: string): string {
  return section.replace(/^## .*\n*/, '').trim();
}
