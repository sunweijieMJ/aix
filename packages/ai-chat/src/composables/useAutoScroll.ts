import { ref, isRef, toValue, type Ref, type MaybeRefOrGetter } from 'vue';
import { onScopeDisposeSafe } from '../utils/onScopeDisposeSafe';

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
  /**
   * 自定义跟随策略，默认 defaultShouldFollow；求值为 undefined 时回退默认策略。
   * 三种形态均可：裸策略函数、ref、getter（返回策略）——后两者支持运行时切换。
   */
  shouldFollow?: MaybeRefOrGetter<ShouldFollow | undefined>;
  /** 是否自动跟随，默认 true；支持响应式（ref / getter），便于父组件运行时切换 */
  autoScroll?: MaybeRefOrGetter<boolean>;
}

export function useAutoScroll(
  scrollEl: Ref<HTMLElement | null>,
  options: UseAutoScrollOptions = {},
) {
  const { threshold = 40, shouldFollow, autoScroll = true } = options;
  const scrollState = ref<ScrollState>('AT_BOTTOM');
  const unreadCount = ref(0);

  // ── 贴底意图（smoothPending / beginSmoothPending 的语义是"贴底轮询"，不限于 smooth 动画期间）──
  //
  // 为什么需要"意图进行中"标记：scrollToBottom(true) 取调用瞬间的 scrollHeight 为目标并乐观置
  // AT_BOTTOM，但动画途中的 scroll 事件经 computeState 按真实位置计算会把状态翻回 SCROLLED_UP，
  // 此后流式增高触发的 follow('streaming') 因 defaultShouldFollow 要求 AT_BOTTOM 全部不跟随，
  // 于是停在过期底部。标记存续期间 computeState 不做这次翻转（见其内部判断）。
  //
  // 为什么用 rAF 轮询而非固定超时：虚拟列表（virtua）新插入、从未测量过的行（如自定义卡片
  // 消息）刚挂载时只有估算高度，真实高度要等测量/布局后才更新到 scrollHeight，这个过程跨多帧
  // 且无固定时长上界。用一次性超时兜底的话，测量比超时慢就会提前清掉意图，之后 scrollHeight
  // 继续变化时状态被误判为 SCROLLED_UP，最终停在卡片中间。改为每帧比对 scrollHeight：发现变化
  // 就瞬时 snap 到新底部并重置稳定帧计数，连续 STABLE_FRAMES_TO_SETTLE 帧不变才收尾，不依赖对耗时的猜测。
  //
  // 意图的三个清除时机：① 连续 STABLE_FRAMES_TO_SETTLE 帧高度不变（内容已稳定）；② 用户 wheel/touchmove
  // 主动打断；③ MAX_SETTLE_FRAMES 保底上限（内容持续异常增长时不至永久轮询）。
  //
  // 轮询是否开启与这次滚动是不是 smooth 无关，只看"是否已有轮询在跑"（见 scrollToBottom）：
  // 刷新页面时 BubbleList 挂载的瞬时 scrollToBottom() 若命中最后一条是自定义卡片，同样要靠
  // 轮询去追后续几帧才测出的真实高度。
  const STABLE_FRAMES_TO_SETTLE = 4; // 连续 4 帧（约 64ms@60fps）高度不变视为已稳定
  const MAX_SETTLE_FRAMES = 60; // 保底上限（约 1s@60fps）
  let smoothPending = false;
  let settleRaf: ReturnType<typeof requestAnimationFrame> | null = null;
  let smoothTarget: HTMLElement | null = null;

  const clearSmoothPending = () => {
    smoothPending = false;
    if (settleRaf !== null) {
      cancelAnimationFrame(settleRaf);
      settleRaf = null;
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
    clearSmoothPending(); // 先清上一次未完成的意图（监听/rAF），防重复挂载
    // 非浏览器环境（SSR / 无 rAF 的测试环境）没有真正的 smooth 动画，没必要也不能开这个
    // 轮询窗口——直接放弃，回退到 computeState 的即时判定，避免调用不存在的
    // requestAnimationFrame 抛错（与 observeContent 对 ResizeObserver 的安全空转风格一致）。
    if (typeof requestAnimationFrame === 'undefined') return;
    smoothPending = true;
    smoothTarget = el;
    // BubbleList 仅接线 @scroll → computeState，无用户输入事件入口；在此对滚动容器
    // 直挂 wheel/touchmove（passive，不影响滚动性能），意图清除时同步解绑
    el.addEventListener('wheel', interruptSmooth, { passive: true });
    el.addEventListener('touchmove', interruptSmooth, { passive: true });

    let lastHeight = el.scrollHeight;
    let stableFrames = 0;
    let frame = 0;
    const tick = () => {
      // 已被打断（wheel/touchmove）或真正到底（computeState 清除）：停止轮询
      if (!smoothPending || smoothTarget !== el) return;
      if (el.scrollHeight !== lastHeight) {
        lastHeight = el.scrollHeight;
        stableFrames = 0;
        // 内容还在变高：瞬时重定目标到最新底部，不再用 smooth（避免动画反复被打断显得卡顿）
        el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      } else {
        stableFrames += 1;
      }
      frame += 1;
      if (stableFrames >= STABLE_FRAMES_TO_SETTLE || frame >= MAX_SETTLE_FRAMES) {
        clearSmoothPending();
        computeState(); // 按最终真实位置收尾定态
        return;
      }
      settleRaf = requestAnimationFrame(tick);
    };
    settleRaf = requestAnimationFrame(tick);
  };

  const computeState = () => {
    const el = scrollEl.value;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= threshold) {
      scrollState.value = 'AT_BOTTOM';
      unreadCount.value = 0;
      // 贴底轮询正在进行时，"此刻恰好到底"不等于"内容已经稳定"——批量插入多条
      // 消息（如刷新页面一次性加载几十条历史、含若干张卡片）过程中，我们自己每帧调用的
      // el.scrollTo() 几乎必然异步触发浏览器原生 scroll 事件，而这类事件很容易恰好命中
      // "刚 snap 过去、暂时追平"的瞬间——若在这里把轮询清掉，之后内容继续变高（如下一张
      // 卡片渲染完成）时就没人再追，最终停在半途。所以这里**不做任何清理**：轮询何时结束
      // 完全交给它自己的连续稳定帧判定（或用户 wheel/touchmove 主动打断）。
      // 无轮询在跑时也无需清理——smoothPending 只在 clearSmoothPending() 内被置 false，
      // 且它同时清掉 settleRaf 与 smoothTarget，三者恒同进同出。
      return;
    }
    // smooth 贴底动画/贴底轮询进行中：途中 scroll 事件不把乐观 AT_BOTTOM 翻回 SCROLLED_UP（见上）
    if (smoothPending) return;
    scrollState.value = 'SCROLLED_UP';
  };

  const scrollToBottom = (smooth = false) => {
    const el = scrollEl.value;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    scrollState.value = 'AT_BOTTOM';
    unreadCount.value = 0;
    // 贴底轮询是否要开始，与这次滚动是不是 smooth 动画无关：虚拟列表/自定义卡片的异步
    // 撑高不会因为这次滚动是瞬时的就不发生——典型场景是刷新页面：BubbleList 挂载时
    // syncScrollState 调 scrollToBottom()（不传 smooth，即瞬时），若最后一条恰好是内容
    // 复杂的自定义卡片消息，首屏这次瞬时滚动读到的 scrollHeight 往往还是虚拟列表给的
    // 估算值，卡片真实高度要再等几帧测量才更新——不开启轮询就没人再追，停在卡片中间。
    // 只有「当前没有轮询在跑」时才启动一轮：插入新消息时 items.length watcher
    // （own/new-message）与末条消息内容 watcher（streaming）几乎同时触发，若后者也无条件
    // 重启轮询，会把前者刚起步的轮询计时器打断重置；流式逐 token 输出时同理，每个 token
    // 都会触发一次 streaming 校正，不应每次都重开一轮。已有轮询在跑时，这次调用只做一次
    // 瞬时位置校正，由 tick() 自己的稳定帧数/帧数上限判断何时收尾。
    if (!smoothPending) beginSmoothPending(el);
  };

  // 归一 shouldFollow 的三种合法形态并求值：ref 取 .value；函数则先以 ctx 调用——
  // getter（忽略参数）返回策略函数，再以 ctx 求值；裸策略函数直接返回 boolean。
  // getter 与裸策略同为函数、静态无法区分，只能按返回值类型分流；求得 undefined 回退默认策略。
  const evalShouldFollow = (ctx: FollowContext): boolean => {
    const opt = isRef(shouldFollow) ? shouldFollow.value : shouldFollow;
    if (typeof opt !== 'function') return defaultShouldFollow(ctx);
    const r = (opt as (c: FollowContext) => ShouldFollow | boolean | undefined)(ctx);
    if (typeof r === 'function') return r(ctx);
    return typeof r === 'boolean' ? r : defaultShouldFollow(ctx);
  };

  /** 在消息变化时调用：根据策略决定贴底，否则累计未读 */
  const follow = (reason: FollowReason, smooth = false) => {
    // 每次求值取当前策略（getter/ref 运行时切换即时生效）
    const ok = evalShouldFollow({
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
  onScopeDisposeSafe(() => {
    ro?.disconnect();
    clearSmoothPending(); // 组件卸载时清理 rAF 轮询与 wheel/touchmove 监听
  });

  return { scrollState, unreadCount, computeState, scrollToBottom, follow, observeContent };
}
