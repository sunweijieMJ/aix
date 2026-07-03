import type { TriggerConfig } from '../types';

/** 一次命中的触发上下文（L1 输出，L2/L3 消费） */
export interface TriggerDetection {
  /** 命中的触发配置 */
  config: TriggerConfig;
  /** 触发字符 */
  char: string;
  /** 触发字符在全文中的下标 */
  startIndex: number;
  /** 触发字符之后到光标的检索词（不含空白） */
  query: string;
}

const isWhitespace = (ch: string) => /\s/.test(ch);

/** position 缺省解析：'@'→anywhere，其余→start（spec D2） */
export const resolvePosition = (config: TriggerConfig): 'anywhere' | 'start' =>
  config.position ?? (config.char === '@' ? 'anywhere' : 'start');

/**
 * 对「光标前文本」反向扫描触发字符（ElMention getMentionCtx 同思路）：
 * 从 cursor-1 向左找最近的触发字符，途中遇空白即终止（查询串不得含空白）。
 * 'anywhere' 要求触发字符前一字符为空白或行首（防 email 误触）；
 * 'start' 要求触发字符所在行内、其之前全为空白（仅行首触发，多行输入每行行首均可）。
 */
export function detectTrigger(
  text: string,
  cursor: number,
  triggers: TriggerConfig[],
): TriggerDetection | null {
  if (!triggers.length || cursor <= 0) return null;
  // 重复 char 后者覆盖前者（Map 后写胜出），dev warn 由 Sender 侧在配置快照时给出
  const byChar = new Map(triggers.map((t) => [t.char, t]));
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = text.charAt(i);
    if (!ch || isWhitespace(ch)) return null;
    const config = byChar.get(ch);
    if (!config) continue;
    if (resolvePosition(config) === 'anywhere') {
      if (i > 0 && !isWhitespace(text.charAt(i - 1))) return null;
    } else {
      // 'start' = 行首：最近换行符之后到触发字符之间全为空白（契约「仅行首」，见 types/README）
      const lineStart = text.lastIndexOf('\n', i - 1) + 1;
      if (text.slice(lineStart, i).trim() !== '') return null;
    }
    return { config, char: ch, startIndex: i, query: text.slice(i + 1, cursor) };
  }
  return null;
}
