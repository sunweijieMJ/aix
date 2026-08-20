import type { ContentBlock } from '../types';
import { toolFollowLen } from './helpers';

/**
 * 内容块数组的「增长指纹」：块数 + 各块文本总长 + 工具块贡献。
 *
 * 流式期间内容是「就地 mutate（last.text += delta）+ push」，数组引用不变，
 * 故无法 watch 引用；改为追踪本指纹，任一维度变化即代表内容仍在增长。
 *
 * 两处共用同一口径：
 * - 自动滚动跟随（末条消息增长即钉底）
 * - 末尾静默判定（指纹不变超阈值即视为输出停顿）
 */
export function contentFingerprint(blocks: ContentBlock[] | undefined): string {
  if (!blocks) return '';
  const textLen = blocks.reduce((n, b) => n + ('text' in b ? b.text.length : 0), 0);
  return `${blocks.length}:${textLen}:${toolFollowLen(blocks)}`;
}
