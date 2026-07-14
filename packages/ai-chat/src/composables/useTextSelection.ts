import { ref, watch, toValue, onScopeDispose } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import type { MessageRole, QuoteAnchor } from '../types';
import { BUBBLE_CONTENT_SELECTOR } from '../utils/helpers';
import { normalizeText, rangeToOffsets, getContext } from '../utils/textRange';

export interface UseTextSelectionOptions {
  /** 监听根（BubbleList 滚动容器） */
  root: MaybeRefOrGetter<HTMLElement | null>;
  enabled?: MaybeRefOrGetter<boolean>;
  /** 移动长按出菜单延时 ms，默认 500 */
  longPressDelay?: number;
  /** 长按期间移动超过该像素判为滚动/误触，默认 10 */
  moveThreshold?: number;
  /** anchor.prefix/suffix 字符数，默认 32 */
  contextChars?: number;
  /** 键盘选区唤出，默认 true */
  keyboard?: boolean;
  /** 启用角色，默认 ['ai'] */
  roles?: MaybeRefOrGetter<MessageRole[]>;
  /** 追加排除选择器 */
  excludeSelector?: string;
}

export interface ActiveSelection {
  text: string;
  anchor: QuoteAnchor;
  getRect: () => DOMRect;
  getClientRects: () => DOMRect[];
  contextElement: HTMLElement;
  source: 'pointer' | 'keyboard';
}

export interface LongPressTrigger {
  point: { x: number; y: number };
  /** 整条消息：messageId + 整条文本，无 start/end（纯数据，零选区机器） */
  defaultTarget: QuoteAnchor;
  contextElement: HTMLElement;
}

export interface UseTextSelectionReturn {
  active: Ref<ActiveSelection | null>;
  trigger: Ref<LongPressTrigger | null>;
  clear: () => void;
  preserve: () => void;
}

/** 落点在这些元素内不触发划词（链接/按钮/表单等交互元素） */
const DEFAULT_EXCLUDE = 'a,button,input,textarea,select,[role="button"],[contenteditable="true"]';

/** selectionchange 去抖 / pointerup 后读选区的延时（等浏览器完成选区收敛） */
const READ_DELAY = 120;
/**
 * 距最近一次指针活动超过该窗口的选区变化视为键盘操作。
 * 已知可接受的误判：拖选松手后 600ms 内若紧接着用键盘扩展选区，仍会被计为 pointer 来源
 * （而非 keyboard）。未做更精细的区分是因为下游（高亮/菜单定位等）对两种 source 的处理
 * 行为一致，不影响功能正确性。
 */
const POINTER_WINDOW = 600;

export function useTextSelection(options: UseTextSelectionOptions): UseTextSelectionReturn {
  const active = ref<ActiveSelection | null>(null);
  const trigger = ref<LongPressTrigger | null>(null);

  const enabled = () => toValue(options.enabled) ?? true;
  const roles = () => toValue(options.roles) ?? (['ai'] as MessageRole[]);
  const exclude = options.excludeSelector
    ? `${DEFAULT_EXCLUDE},${options.excludeSelector}`
    : DEFAULT_EXCLUDE;
  const longPressDelay = options.longPressDelay ?? 500;
  const moveThreshold = options.moveThreshold ?? 10;
  const contextChars = options.contextChars ?? 32;
  const keyboard = options.keyboard ?? true;

  /** 节点 → 命中的气泡根（角色过滤 + 排除交互元素 + 限定在 root 内），未命中 null */
  const bubbleOf = (node: Node | null): HTMLElement | null => {
    const el: Element | null = node instanceof Element ? node : (node?.parentElement ?? null);
    if (!el || el.closest(exclude)) return null;
    const bubble = el.closest<HTMLElement>('[data-aix-message-id]');
    if (!bubble) return null;
    if (!roles().includes(bubble.dataset.aixRole ?? '')) return null;
    const root = toValue(options.root);
    if (!root || !root.contains(bubble)) return null;
    return bubble;
  };

  // ==================== PC：拖选 / 键盘 ====================

  let savedRange: Range | null = null;
  let lastPointerAt = 0;
  let readTimer: ReturnType<typeof setTimeout> | null = null;

  const readSelection = (source: 'pointer' | 'keyboard') => {
    if (!enabled()) return;
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      active.value = null;
      // 选区已收窄/消失，同步丢弃 savedRange，避免后续 preserve() 恢复出过期选区
      savedRange = null;
      return;
    }
    const raw = sel.getRangeAt(0);
    const bubble = bubbleOf(raw.startContainer);
    if (!bubble) {
      active.value = null;
      return;
    }
    const range = raw.cloneRange();
    const contentEl = bubble.querySelector<HTMLElement>(BUBBLE_CONTENT_SELECTOR) ?? bubble;
    // 选区终点越过内容区末尾（跨消息拖选、落入 footer 的分支切换器/自定义 action 文本等，
    // 这些 UI 文本在文档序上位于 content 之后）：钳制到起点消息内容区末尾，避免 UI 文本被
    // Range.toString() 拼进 exact，同时让终点落回内容区内，偏移换算不因终点越出而退化。
    // 用边界比较而非 contains：终点在内容区之前（如选区整体在 header 插槽内）时不钳制，
    // 否则 setEnd 会把选区向前扩张成「header 选中点 → 整段正文」。
    const contentRange = document.createRange();
    contentRange.selectNodeContents(contentEl);
    if (range.compareBoundaryPoints(Range.END_TO_END, contentRange) > 0) {
      range.setEnd(contentEl, contentEl.childNodes.length);
    }
    // 对称钳制起点：从 header（角色名/时间戳等，文档序上位于 content 之前）按下拖到正文时，
    // header UI 文本会被拼进 exact 头部、且回链搜索必然失配。仅当选区确实跨入内容区
    // （终点不在内容区之前）才钳制——选区整体在 header 内时保持原选区不动（既有契约：
    // header 内选词可原样引用，不得被钳制 collapse 或向后扩张）。
    if (
      range.compareBoundaryPoints(Range.START_TO_START, contentRange) < 0 &&
      contentRange.comparePoint(range.endContainer, range.endOffset) >= 0
    ) {
      range.setStart(contentEl, 0);
    }
    const text = normalizeText(range.toString());
    if (!text) {
      active.value = null;
      return;
    }
    const startEl =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const blockEl = startEl?.closest<HTMLElement>('[data-aix-block-id]') ?? null;
    // 偏移仅在块内有意义（回链快路径按块还原）；无块打标的内容退回消息级 anchor
    const offsetHost = blockEl ?? contentEl;
    const offsets = rangeToOffsets(offsetHost, range);
    const context = offsets
      ? getContext(offsetHost, offsets.start, offsets.end, contextChars)
      : null;
    const anchor: QuoteAnchor = {
      source: {
        messageId: bubble.dataset.aixMessageId!,
        blockId: blockEl?.dataset.aixBlockId,
        role: bubble.dataset.aixRole as MessageRole | undefined,
      },
      exact: text,
      // 原文另存：exact 折叠空白仅作匹配口径，复制/toPrompt 需保留换行（代码块缩进等）
      rawText: range.toString(),
      prefix: context?.prefix || undefined,
      suffix: context?.suffix || undefined,
      start: blockEl ? offsets?.start : undefined,
      end: blockEl ? offsets?.end : undefined,
    };
    savedRange = range.cloneRange();
    active.value = {
      text,
      anchor,
      getRect: () => range.getBoundingClientRect(),
      getClientRects: () => Array.from(range.getClientRects()),
      contextElement: bubble,
      source,
    };
  };

  const scheduleRead = (source: 'pointer' | 'keyboard') => {
    if (readTimer) clearTimeout(readTimer);
    readTimer = setTimeout(() => readSelection(source), READ_DELAY);
  };

  const onPointerUp = () => {
    lastPointerAt = Date.now();
    scheduleRead('pointer');
  };

  const onSelectionChange = () => {
    const isPointer = Date.now() - lastPointerAt < POINTER_WINDOW;
    if (!isPointer && !keyboard) return;
    scheduleRead(isPointer ? 'pointer' : 'keyboard');
  };

  // ==================== 移动：长按 → trigger（整条） ====================

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressPoint: { x: number; y: number } | null = null;
  let pressTarget: EventTarget | null = null;

  const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    pressPoint = null;
    pressTarget = null;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (!enabled()) return;
    if (e.touches.length !== 1) {
      // 第二指落下（多点触控）：不是有效的单指长按手势，取消进行中的长按计时
      cancelPress();
      return;
    }
    const t = e.touches[0]!;
    pressPoint = { x: t.clientX, y: t.clientY };
    pressTarget = e.target;
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      const bubble = bubbleOf(pressTarget as Node | null);
      if (!bubble || !pressPoint) return;
      const contentEl = bubble.querySelector<HTMLElement>(BUBBLE_CONTENT_SELECTOR) ?? bubble;
      trigger.value = {
        point: pressPoint,
        defaultTarget: {
          source: {
            messageId: bubble.dataset.aixMessageId!,
            role: bubble.dataset.aixRole as MessageRole | undefined,
          },
          exact: normalizeText(contentEl.textContent ?? ''),
          rawText: contentEl.textContent ?? '',
        },
        contextElement: bubble,
      };
    }, longPressDelay);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!pressPoint || e.touches.length !== 1) return;
    const t = e.touches[0]!;
    if (
      Math.abs(t.clientX - pressPoint.x) > moveThreshold ||
      Math.abs(t.clientY - pressPoint.y) > moveThreshold
    ) {
      cancelPress();
    }
  };

  /**
   * 长按出菜单、或长按进行中时抑制系统右键/长按菜单。
   * 单靠 trigger.value 判断存在竞态：移动端系统 contextmenu 可能先于 500ms 长按计时器
   * 派发（系统长按判定阈值可能短于本组件的 longPressDelay），此时 trigger 尚未置位会漏抑制。
   * 这是对设计文档已知现实约束（移动端系统菜单无法 100% 抑制）的 JS 兜底，尽量缩小竞态窗口，
   * 而非试图彻底消除——原生系统菜单仍可能在极端时序下抢先弹出。
   */
  const onContextMenu = (e: Event) => {
    if (trigger.value && bubbleOf(e.target as Node | null)) {
      e.preventDefault();
      return;
    }
    const pressing = pressTimer != null && pressPoint != null;
    if (pressing && bubbleOf(pressTarget as Node | null)) {
      e.preventDefault();
    }
  };

  // ==================== 装配 / 清理 ====================

  const listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  const bind = (
    target: EventTarget,
    type: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  };
  const unbindAll = () => {
    for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
    listeners.length = 0;
  };

  /** 清理划词状态与在途计时器，但不折叠用户当前 DOM 选区（供禁用/卸载路径使用） */
  const resetInternal = () => {
    active.value = null;
    trigger.value = null;
    savedRange = null;
    if (readTimer) clearTimeout(readTimer);
    readTimer = null;
    cancelPress();
  };

  watch(
    () => [toValue(options.root), enabled()] as const,
    ([root, isEnabled]) => {
      unbindAll();
      resetInternal();
      if (!root || !isEnabled) return;
      bind(root, 'pointerup', onPointerUp as EventListener);
      bind(document, 'selectionchange', onSelectionChange as EventListener);
      // 长按分支恒装配（触屏事件只在触屏设备产生，无需预判平台；
      // usePlatform 供 AiChat 层做「是否启用移动路径」的逃生口）
      bind(root, 'touchstart', onTouchStart as EventListener, { passive: true });
      bind(root, 'touchmove', onTouchMove as EventListener, { passive: true });
      bind(root, 'touchend', cancelPress as EventListener);
      bind(root, 'touchcancel', cancelPress as EventListener);
      bind(root, 'contextmenu', onContextMenu as EventListener);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    unbindAll();
    resetInternal();
  });

  const clear = () => {
    resetInternal();
    // 防 clear 后 pending 读取复活选区（滚动关闭/动作关闭的闭环保障）：
    // clear() 调用前若刚有 selectionchange 调度了 readTimer（120ms 去抖），
    // 不取消的话定时器会照常触发 readSelection 把 active 重新置回非 null
    // 主动折叠 DOM 选区：菜单关闭后若残留选区，任何后续 selectionchange（如聚焦输入框）
    // 都会把它重新读回 active 导致菜单重开；折叠后 readSelection 走 collapsed 分支幂等收敛
    window.getSelection?.()?.removeAllRanges();
  };

  /** focus（如聚焦输入框）清掉选区高亮后，按保存的 cloneRange 恢复 */
  const preserve = () => {
    if (!savedRange) return;
    const sel = window.getSelection?.();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRange.cloneRange());
  };

  return { active, trigger, clear, preserve };
}
