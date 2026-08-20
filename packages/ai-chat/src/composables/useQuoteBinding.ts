import { copyText } from '@aix/hooks';
import { computed, provide, ref, toValue, watch } from 'vue';
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue';
import type { ChatMessage, Quote, QuoteAnchor, QuoteConfig } from '../types';
import { BUBBLE_CONTENT_SELECTOR, genQuoteId, messageText } from '../utils/helpers';
import { upsertQuote } from '../utils/quoteDedupe';
import { highlightElement, highlightRange } from '../utils/quoteHighlight';
import { findTextRange, normalizeText, offsetsToRange } from '../utils/textRange';
import { useQuoteMenu, QUOTE_LOCATE_KEY } from './useQuoteMenu';
import { useTextSelection } from './useTextSelection';
import type { ActiveSelection, LongPressTrigger } from './useTextSelection';

/** 合并了内置默认值后的划词配置（AiChat 侧解析产出） */
export type ResolvedQuoteConfig = Required<
  Pick<QuoteConfig, 'enable' | 'pcQuoteAction' | 'maxVisibleChips'>
> &
  QuoteConfig;

export interface UseQuoteBindingOptions {
  /** 已合并默认值的划词配置 */
  config: MaybeRefOrGetter<ResolvedQuoteConfig>;
  /** 划词检测根 / 回链高亮宿主（消息列表滚动容器） */
  root: Ref<HTMLElement | null>;
  /** 滚动到某条消息并等其挂载，返回气泡根元素（找不到 → null） */
  scrollToBubble: (messageId: string) => Promise<HTMLElement | null | undefined>;
  /** 按渲染视图 id 取消息（可能是 parser 1→N 的派生气泡 id） */
  messageFor: (messageId: string) => ChatMessage | undefined;
  /** 命令式写入输入框（划词 ask 注入 prompt 用） */
  setSenderValue: (text: string) => void;
  /** 聚焦输入框 */
  focusSender: () => void;
}

export interface UseQuoteBindingReturn {
  /** 待发引用（发送时打包成 quote 块前置进 content） */
  pendingQuotes: Ref<Quote[]>;
  /** 按折叠阈值裁剪后的可见 chip */
  visibleQuotes: ComputedRef<Quote[]>;
  /** 被折叠隐藏的 chip 数量（0 表示无需折叠入口） */
  hiddenChipCount: ComputedRef<number>;
  /** chip 是否展开（受控于「+N」按钮） */
  chipsExpanded: Ref<boolean>;
  /** 加入一条引用（锚点去重 + 意图更新） */
  insertQuote: (q: Quote) => void;
  /** 按 id 移除一条引用 */
  removeQuote: (id: string) => void;
  /** 清空全部待发引用（发送后调用） */
  clearQuotes: () => void;
  /** 回链：滚到消息并高亮该锚点对应的文本范围 */
  locateAnchor: (anchor: QuoteAnchor) => Promise<void>;
  /** PC 操作栏「引用整条」入口 */
  quoteMessage: (item: ChatMessage) => void;
  /** L2 菜单控制器（模板渲染 QuoteMenu / quote-menu 插槽用） */
  menu: ReturnType<typeof useQuoteMenu>;
  /** L1 当前选区（模板定位菜单用） */
  active: Ref<ActiveSelection | null>;
  /** L1 长按触发信息（移动端整条引用） */
  trigger: Ref<LongPressTrigger | null>;
}

/**
 * 划词引用 / 追问的整套接线（L1 检测 → L2 菜单 → chip 暂存 → 回链高亮）。
 *
 * 从 AiChat 抽出的目的不是减行数，而是把这条链路对宿主的依赖**显式化**：它只需要
 * 「一个滚动容器、一个滚动定位函数、一个消息查询函数、两个输入框动作」，其余状态自持。
 * 三层的分工仍在各自的 composable 里（useTextSelection / useQuoteMenu），本函数只负责编排。
 */
export function useQuoteBinding(options: UseQuoteBindingOptions): UseQuoteBindingReturn {
  const cfg = () => toValue(options.config);

  // 待发引用（chip 的数据源）
  const pendingQuotes = ref<Quote[]>([]);
  // 锚点去重 + 意图更新（见 utils/quoteDedupe）：同一段文字反复引用只保留一条 chip
  const insertQuote = (q: Quote) => {
    pendingQuotes.value = upsertQuote(pendingQuotes.value, q);
  };
  const removeQuote = (id: string) => {
    pendingQuotes.value = pendingQuotes.value.filter((q) => q.id !== id);
  };
  const clearQuotes = () => {
    pendingQuotes.value = [];
  };

  // chip 折叠：超过 maxVisibleChips 收起为「+N」，点击展开；数量回落到阈值内（含发送后清空）自动复位
  const chipsExpanded = ref(false);
  const hiddenChipCount = computed(() =>
    Math.max(0, pendingQuotes.value.length - cfg().maxVisibleChips),
  );
  const visibleQuotes = computed(() => {
    const max = cfg().maxVisibleChips;
    return chipsExpanded.value || pendingQuotes.value.length <= max
      ? pendingQuotes.value
      : pendingQuotes.value.slice(0, max);
  });
  watch(pendingQuotes, (list) => {
    if (list.length <= cfg().maxVisibleChips) chipsExpanded.value = false;
  });

  // L1：检测（BubbleList 渲染后 root 才非空，watch immediate 装配在 useTextSelection 内部处理）
  const {
    active,
    trigger,
    clear: clearSelection,
  } = useTextSelection({
    root: options.root,
    enabled: () => cfg().enable,
    longPressDelay: cfg().longPressDelay,
    contextChars: 32,
    keyboard: cfg().keyboard,
    roles: () => cfg().roles ?? ['ai'],
    excludeSelector: cfg().excludeSelector,
  });

  // 回链：滚到消息 → 等挂载 → 块内文本搜索还原 Range 高亮（主路径），偏移快路径兜底，
  // 整条引用/未命中 → 整气泡高亮降级
  const locateAnchor = async (anchor: QuoteAnchor) => {
    const el = await options.scrollToBubble(anchor.source.messageId);
    if (!el) return; // 派生 id 不在当前分支等 → 优雅降级不高亮
    const isWhole = anchor.start == null && !anchor.source.blockId;
    if (isWhole) {
      highlightElement(el);
      return;
    }
    const host =
      (anchor.source.blockId &&
        el.querySelector<HTMLElement>(
          `[data-aix-block-id="${CSS.escape(anchor.source.blockId)}"]`,
        )) ||
      el.querySelector<HTMLElement>(BUBBLE_CONTENT_SELECTOR) ||
      el;
    const range =
      findTextRange(host, anchor.exact, anchor.prefix, anchor.suffix) ??
      (anchor.start != null && anchor.end != null
        ? offsetsToRange(host, anchor.start, anchor.end)
        : null);
    if (range) highlightRange(range);
    else highlightElement(el);
  };

  // L2：控制器（依赖注入，见 useQuoteMenu 契约）
  const menu = useQuoteMenu({
    selection: active,
    trigger,
    actions: () => cfg().actions,
    insertQuote,
    setSenderValue: options.setSenderValue,
    focusSender: () => {
      options.focusSender();
      // 选区保全由 QuoteToolbar 的 mousedown.prevent 覆盖菜单交互期间；动作完成聚焦输入框时
      // 应让选区自然清除，否则 preserve() 触发 selectionchange 会导致菜单重弹（且造成选区高亮残留）
    },
    copy: copyText,
    onLocate: locateAnchor,
    messageFor: options.messageFor,
  });

  // 菜单关闭时同步清 L1 目标（下次交互重新产出）
  watch(menu.visible, (v) => {
    if (!v) clearSelection();
  });
  // 滚动即关闭（virtua 回收锚点会失效）。仅在划词开启时装配：clearSelection 会 removeAllRanges
  // 清掉浏览器原生选区，无守卫时未启用 quote 的消费方「选中文本 → 滚动 → 复制」也会被误清
  watch(
    [options.root, () => cfg().enable],
    ([el, enable], _old, onCleanup) => {
      if (!el || !enable) return;
      const onScroll = () => clearSelection();
      el.addEventListener('scroll', onScroll, { passive: true });
      onCleanup(() => el.removeEventListener('scroll', onScroll));
    },
    { immediate: true },
  );

  // PC 操作栏整条引用：与移动长按整条走完全同一条 L2 出口（insertQuote → chip → focus）。
  // exact 口径也与长按对齐（渲染后 textContent 经 normalizeText 折叠，rawText 保留原文）：
  // quoteDedupe.sameAnchor 按 exact 严格相等判重，此前 PC 路径用未归一化的 markdown 源码，
  // 同一条消息经两路各引用一次会产出两枚语义相同的 chip，且 chip 上裸露 **、``` 等源码符号。
  // 点击操作栏时气泡必然已挂载，DOM 查询失败仅是防御分支（回退 markdown 源文本）。
  const quoteMessage = (item: ChatMessage) => {
    const bubble = options.root.value?.querySelector<HTMLElement>(
      `[data-aix-message-id="${CSS.escape(item.id)}"]`,
    );
    const contentEl = bubble?.querySelector<HTMLElement>(BUBBLE_CONTENT_SELECTOR) ?? bubble;
    const raw = contentEl?.textContent || messageText(item);
    insertQuote({
      id: genQuoteId(),
      anchor: {
        source: { messageId: item.id, role: item.role },
        exact: normalizeText(raw),
        rawText: raw,
      },
    });
    options.focusSender();
  };

  // 历史 quote 块 / chip 的回链通道（QuoteBlock inject 消费）
  provide(QUOTE_LOCATE_KEY, (q: Quote) => locateAnchor(q.anchor));

  return {
    pendingQuotes,
    visibleQuotes,
    hiddenChipCount,
    chipsExpanded,
    insertQuote,
    removeQuote,
    clearQuotes,
    locateAnchor,
    quoteMessage,
    menu,
    active,
    trigger,
  };
}
