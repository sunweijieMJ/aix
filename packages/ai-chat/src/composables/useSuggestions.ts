import { computed, shallowRef, toValue, watch } from 'vue';
import type { ComputedRef, MaybeRefOrGetter } from 'vue';
import type { ChatMessage, SuggestionItem } from '../types';
import { normalizeSuggestions } from '../utils/helpers';

/** 追问建议开关：true 全默认；对象可配 fillOnly（点击仅回填不发送）/ max（上限，默认 5） */
export type SuggestionsConfig = boolean | { fillOnly?: boolean; max?: number };

export interface UseSuggestionsOptions {
  /** 配置（未配置 / false 视为关闭，visible 恒为空） */
  config: MaybeRefOrGetter<SuggestionsConfig | undefined>;
  /**
   * 通道②的宿主来源：取其中**最后一条 AI 消息**自带的 suggestions。
   * 应传「数据层原始消息」而非 parser 映射后的渲染消息——1→N 拆分时末气泡未必带 suggestions。
   */
  messages: MaybeRefOrGetter<ChatMessage[]>;
  /** 流式进行中：抑制展示，且上升沿清空通道①（新一轮流开始，旧建议不再适用） */
  isLoading: MaybeRefOrGetter<boolean>;
  /** fillOnly 时的回填出口（通常是聚焦并写入输入框） */
  fill: (text: string) => void;
  /** 非 fillOnly 时的发送出口 */
  send: (text: string) => void;
  /** 点击建议时对外透出（发送/回填之前触发，供埋点） */
  onSelect?: (item: SuggestionItem) => void;
}

export interface UseSuggestionsReturn {
  /** 当前应展示的建议（已按 max 截断；关闭或流式中为空数组） */
  visible: ComputedRef<SuggestionItem[]>;
  /**
   * 命令式立即展示临时建议（通道①，优先于通道②）。
   * 传空数组时置 null，语义为「归位到通道②」（显示最后一条 AI 消息自带的建议，若有）。
   */
  setSuggestions: (items: Array<string | SuggestionItem>) => void;
  /** 清空通道①临时建议（发送、切会话等场景），不影响通道② */
  clearTemp: () => void;
  /** 点击某条建议：先对外透出，再按 fillOnly 走回填或发送 */
  select: (item: SuggestionItem) => void;
}

/**
 * 追问建议（Follow-up Suggestions）的双通道状态机。
 *
 * - **通道①**：`setSuggestions` 命令式注入的临时建议，不持久化，发送 / 新流 / 切会话即清；
 * - **通道②**：随消息树持久化的 `message.suggestions`，由 `parseChunk` 在流内下发。
 *
 * 通道①存在时优先于通道②；两者都空则不展示。展示在流式期间统一抑制——
 * 上一轮的追问建议在新回答生成中途仍挂着会造成误导。
 */
export function useSuggestions(options: UseSuggestionsOptions): UseSuggestionsReturn {
  const resolved = computed(() => {
    const s = toValue(options.config);
    if (!s) return null;
    return { fillOnly: false, max: 5, ...(s === true ? {} : s) };
  });

  // 通道①临时建议（不持久化）
  const temp = shallowRef<SuggestionItem[] | null>(null);
  const clearTemp = () => {
    temp.value = null;
  };
  const setSuggestions = (items: Array<string | SuggestionItem>) => {
    temp.value = items.length ? normalizeSuggestions(items) : null;
  };

  // 任何新流开始（发送/重生成/编辑重发/续流）即清通道①，与「发送即清」同语义；
  // 覆盖 onReload/onEdit/resume 等不经 onSend 包装的新流起点。
  watch(
    () => toValue(options.isLoading),
    (v) => {
      if (v) clearTemp();
    },
  );

  // 通道②宿主：最后一条 AI 消息
  const lastAiMessage = computed(() => {
    const list = toValue(options.messages);
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (item?.role === 'ai') return item;
    }
    return null;
  });

  const visible = computed<SuggestionItem[]>(() => {
    const cfg = resolved.value;
    if (!cfg || toValue(options.isLoading)) return [];
    const list = temp.value ?? lastAiMessage.value?.suggestions ?? [];
    return list.slice(0, cfg.max);
  });

  const select = (item: SuggestionItem) => {
    options.onSelect?.(item);
    if (resolved.value?.fillOnly) options.fill(item.text);
    else options.send(item.text);
  };

  return { visible, setSuggestions, clearTemp, select };
}
