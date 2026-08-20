import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import type { ChatMessage } from '../types';
import { messageText } from '../utils/helpers';

/** 大纲条目：一条可跳转的提问刻度 */
export interface OutlineEntry {
  /** 目标消息 id（交给 BubbleList.scrollToBubble 定位） */
  messageId: string;
  /** 刻度悬浮展示的摘要文本 */
  label: string;
  /** 第几个提问，从 1 开始 */
  ordinal: number;
}

export interface UseMessageOutlineOptions {
  /** 消息列表（通常为激活路径上的 parsedMessages） */
  messages: MaybeRefOrGetter<ChatMessage[]>;
  /** 哪些消息进大纲，默认 role === 'user' */
  filter?: (m: ChatMessage) => boolean;
  /** 摘要提取，默认取消息文本并截断；返回空串时由组件层兜底文案 */
  toLabel?: (m: ChatMessage) => string;
  /** 滑动窗口半径，默认 8；传 Infinity 关闭窗口（全量展示） */
  window?: MaybeRefOrGetter<number>;
  /** 当前活跃 messageId（由可视区同步驱动），决定窗口居中位置 */
  activeId?: MaybeRefOrGetter<string | undefined>;
}

export interface UseMessageOutlineReturn {
  /** 全量条目（按消息顺序） */
  entries: ComputedRef<OutlineEntry[]>;
  /** 按 activeId 居中裁剪后的可见条目；长会话下避免刻度条过长 */
  windowed: ComputedRef<OutlineEntry[]>;
}

/** 默认摘要长度上限 */
const LABEL_MAX = 40;

/** 默认入选规则：只取用户提问。导出以便宿主复用同一口径，避免默认值在两处漂移 */
export const defaultOutlineFilter = (m: ChatMessage) => m.role === 'user';

/** 默认摘要提取：消息文本折叠空白并截断。导出理由同上 */
export const defaultOutlineToLabel = (m: ChatMessage): string => {
  const text = messageText(m).trim().replace(/\s+/g, ' ');
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX)}…` : text;
};

/**
 * 对话大纲：从消息列表派生「提问刻度」并做滑动窗口裁剪。
 *
 * 纯派生、无 DOM 副作用——可视区同步交给 useVisibleMessage，滚动定位交给
 * BubbleList.scrollToBubble，故本 composable 可独立复用于自定义大纲 UI。
 *
 * 窗口语义：以 activeId 所在条目为中心取 ±window。activeId 缺失或已不在
 * 列表中（如切换分支后指向了非激活路径的消息）时，退化为取末尾一段——
 * 对话场景下末尾即用户当前关注处。
 */
export function useMessageOutline(options: UseMessageOutlineOptions): UseMessageOutlineReturn {
  const {
    messages,
    filter = defaultOutlineFilter,
    toLabel = defaultOutlineToLabel,
    window: win,
    activeId,
  } = options;

  const entries = computed<OutlineEntry[]>(() => {
    const list = toValue(messages) ?? [];
    const result: OutlineEntry[] = [];
    for (const m of list) {
      if (!filter(m)) continue;
      result.push({ messageId: m.id, label: toLabel(m), ordinal: result.length + 1 });
    }
    return result;
  });

  const windowed = computed<OutlineEntry[]>(() => {
    const all = entries.value;
    // 夹到非负：负半径会让下方 start > end，slice 返回空数组 → 大纲静默消失且无告警
    const radius = Math.max(0, toValue(win) ?? 8);
    // Infinity / 覆盖不到的半径：全量返回，省掉切片开销
    if (!Number.isFinite(radius) || all.length <= radius * 2 + 1) return all;

    const active = toValue(activeId);
    const activeIdx = active ? all.findIndex((e) => e.messageId === active) : -1;
    // activeId 缺失或已失效（切分支）→ 取末尾窗口，而非静默停在旧位置
    const center = activeIdx >= 0 ? activeIdx : all.length - 1;

    let start = center - radius;
    let end = center + radius + 1;
    // 贴边时把窗口整体推回列表内，保持窗口尺寸恒定（否则首尾处刻度会变少）
    if (start < 0) {
      end += -start;
      start = 0;
    }
    if (end > all.length) {
      start -= end - all.length;
      end = all.length;
    }
    return all.slice(Math.max(start, 0), end);
  });

  return { entries, windowed };
}
