import type { Quote, QuoteAnchor } from '../types';

/** 锚点等价：同消息、同文本、同偏移视为同一段引用 */
const sameAnchor = (a: QuoteAnchor, b: QuoteAnchor): boolean =>
  a.source.messageId === b.source.messageId && a.exact === b.exact && a.start === b.start && a.end === b.end;

/**
 * 锚点去重 + 意图更新：同一段文字反复引用只保留一条 chip——
 * 重复点同一动作幂等；点不同动作（先解释后翻译）更新既有 chip 的意图标签，不新增。
 * 不同文字/不同消息的引用照常累积（多引用能力保留）。
 */
export const upsertQuote = (list: Quote[], q: Quote): Quote[] => {
  const idx = list.findIndex((p) => sameAnchor(p.anchor, q.anchor));
  if (idx < 0) return [...list, q];
  const existing = list[idx]!;
  if (existing.intent === q.intent) return list; // 幂等
  const next = [...list];
  next[idx] = { ...existing, intent: q.intent }; // 保留原 id，chip 不重挂
  return next;
};
