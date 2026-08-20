import type { NodeState } from '../types.js';

/**
 * 记录每个文本节点的翻译状态，用于 MutationObserver 防环路判断：
 * 替换动作本身会触发新的 mutation，若 textContent 与已记录的 translatedText 一致，
 * 说明这是自身刚写回的值，应跳过；否则视为业务重新渲染了新文本，需要重新翻译。
 */
export class NodeRegistry {
  private readonly states = new WeakMap<Text, NodeState>();

  record(node: Text, state: NodeState): void {
    this.states.set(node, state);
  }

  get(node: Text): NodeState | undefined {
    return this.states.get(node);
  }

  /**
   * 若已记录的 lang 与目标语言不同，即使 textContent 未变也返回 false——
   * 语言切换场景下旧译文还没被覆写，必须能重新入队翻译成新语言，不能被误判为"无需处理"。
   * targetLang 与已记录 lang 相同时，才退化为纯 textContent 比对（MutationObserver 防环路场景）。
   */
  shouldSkip(node: Text, targetLang: string): boolean {
    const state = this.states.get(node);
    if (state === undefined) return false;
    if (state.lang !== targetLang) return false;
    return node.textContent === state.translatedText;
  }

  clear(node: Text): void {
    this.states.delete(node);
  }
}
