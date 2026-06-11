import { ref, toValue, onScopeDispose, type Ref, type MaybeRefOrGetter } from 'vue';

export type ScrollState = 'AT_BOTTOM' | 'SCROLLED_UP' | 'HAS_NEW_MESSAGES';
export type FollowReason = 'own-message' | 'new-message' | 'streaming';

export interface FollowContext {
  reason: FollowReason;
  scrollState: ScrollState;
  autoScroll: boolean;
}

export type ShouldFollow = (ctx: FollowContext) => boolean;

/** 默认跟随策略：own/new 贴底，streaming 仅底部跟随 */
export const defaultShouldFollow: ShouldFollow = ({ reason, scrollState, autoScroll }) => {
  if (!autoScroll) return false;
  if (reason === 'streaming') return scrollState === 'AT_BOTTOM';
  return true;
};

export interface UseAutoScrollOptions {
  threshold?: number; // 距底多少 px 视为 AT_BOTTOM，默认 40
  shouldFollow?: ShouldFollow;
  /** 是否自动跟随，默认 true；支持响应式（ref / getter），便于父组件运行时切换 */
  autoScroll?: MaybeRefOrGetter<boolean>;
}

export function useAutoScroll(
  scrollEl: Ref<HTMLElement | null>,
  options: UseAutoScrollOptions = {},
) {
  const { threshold = 40, shouldFollow = defaultShouldFollow, autoScroll = true } = options;
  const scrollState = ref<ScrollState>('AT_BOTTOM');
  const unreadCount = ref(0);

  // ── smooth 贴底意图 ─────────────────────────────────────────────
  // 修复：scrollToBottom(true) 一次性取调用瞬间的 scrollHeight 为目标并乐观置 AT_BOTTOM，
  // 但 smooth 动画途中的 scroll 事件经 computeState 按真实位置计算会把状态翻回 SCROLLED_UP，
  // 此后流式增高触发的 follow('streaming') 因 defaultShouldFollow 要求 AT_BOTTOM 全部不跟随，
  // 动画期间内容增高 >threshold 时最终停在过期底部、贴底跟随被打断。
  // 引入"贴底意图进行中"标记：存续期间 computeState 不把乐观 AT_BOTTOM 翻回 SCROLLED_UP。
  // 标记清除时机：①已真正到底（distance<=threshold）②用户 wheel/touchmove 主动输入打断
  // ③500ms 保底超时（动画异常未到底也不至永久守护）。
  let smoothPending = false;
  let smoothTimer: ReturnType<typeof setTimeout> | null = null;
  let smoothTarget: HTMLElement | null = null;

  const clearSmoothPending = () => {
    smoothPending = false;
    if (smoothTimer) {
      clearTimeout(smoothTimer);
      smoothTimer = null;
    }
    if (smoothTarget) {
      smoothTarget.removeEventListener('wheel', interruptSmooth);
      smoothTarget.removeEventListener('touchmove', interruptSmooth);
      smoothTarget = null;
    }
  };

  // 用户主动滚动输入（wheel/touchmove）：打断贴底意图，并按真实位置立即重算状态
  const interruptSmooth = () => {
    clearSmoothPending();
    computeState();
  };

  const beginSmoothPending = (el: HTMLElement) => {
    clearSmoothPending(); // 先清上一次未完成的意图（监听/timer），防重复挂载
    smoothPending = true;
    smoothTarget = el;
    // BubbleList 仅接线 @scroll → computeState，无用户输入事件入口；在此对滚动容器
    // 直挂 wheel/touchmove（passive，不影响滚动性能），意图清除时同步解绑
    el.addEventListener('wheel', interruptSmooth, { passive: true });
    el.addEventListener('touchmove', interruptSmooth, { passive: true });
    smoothTimer = setTimeout(clearSmoothPending, 500);
  };

  const computeState = () => {
    const el = scrollEl.value;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= threshold) {
      scrollState.value = 'AT_BOTTOM';
      unreadCount.value = 0;
      clearSmoothPending(); // 已真正到底：贴底意图达成
      return;
    }
    // smooth 贴底动画进行中：途中 scroll 事件不把乐观 AT_BOTTOM 翻回 SCROLLED_UP（见上）
    if (smoothPending) return;
    scrollState.value = 'SCROLLED_UP';
  };

  const scrollToBottom = (smooth = false) => {
    const el = scrollEl.value;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    scrollState.value = 'AT_BOTTOM';
    unreadCount.value = 0;
    if (smooth) beginSmoothPending(el);
    else clearSmoothPending(); // 瞬时滚动立即到底，贴底意图随之达成
  };

  /** 在消息变化时调用：根据策略决定贴底，否则累计未读 */
  const follow = (reason: FollowReason, smooth = false) => {
    const ok = shouldFollow({
      reason,
      scrollState: scrollState.value,
      autoScroll: toValue(autoScroll),
    });
    if (ok) {
      // smooth 贴底动画进行中又有内容增高：改用瞬时滚动重定目标，保证最终真正贴底
      // （否则 smooth 动画停在调用瞬间取到的过期 scrollHeight）
      scrollToBottom(smooth && !smoothPending);
    } else if (reason !== 'streaming') {
      unreadCount.value += 1;
      scrollState.value = 'HAS_NEW_MESSAGES';
    }
  };

  // 观测内容高度变化：流式逐字、块淡入、公式渲染、并发输出等"非滚动"导致的增高，
  // 在内容区高度变化时若此前处于底部就持续钉底（reason='streaming' 走 shouldFollow 策略）。
  // 相比仅在"消息内容增量"时跟随，这里覆盖打字机/渲染时序错位的全部增高，消除抖动与不贴底。
  let ro: ResizeObserver | null = null;
  const observeContent = (contentEl: HTMLElement | null) => {
    ro?.disconnect();
    ro = null;
    // jsdom 等环境无 ResizeObserver 时安全空转
    if (!contentEl || typeof ResizeObserver === 'undefined') return;
    ro = new ResizeObserver(() => follow('streaming'));
    ro.observe(contentEl);
  };
  onScopeDispose(() => {
    ro?.disconnect();
    clearSmoothPending(); // 组件卸载时清理保底 timer 与 wheel/touchmove 监听
  });

  return { scrollState, unreadCount, computeState, scrollToBottom, follow, observeContent };
}
