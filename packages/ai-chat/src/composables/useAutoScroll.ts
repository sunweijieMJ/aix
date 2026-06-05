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

  const computeState = () => {
    const el = scrollEl.value;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    scrollState.value = distance <= threshold ? 'AT_BOTTOM' : 'SCROLLED_UP';
    if (scrollState.value === 'AT_BOTTOM') unreadCount.value = 0;
  };

  const scrollToBottom = (smooth = false) => {
    const el = scrollEl.value;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    scrollState.value = 'AT_BOTTOM';
    unreadCount.value = 0;
  };

  /** 在消息变化时调用：根据策略决定贴底，否则累计未读 */
  const follow = (reason: FollowReason, smooth = false) => {
    const ok = shouldFollow({
      reason,
      scrollState: scrollState.value,
      autoScroll: toValue(autoScroll),
    });
    if (ok) {
      scrollToBottom(smooth);
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
  onScopeDispose(() => ro?.disconnect());

  return { scrollState, unreadCount, computeState, scrollToBottom, follow, observeContent };
}
