import { useEventListener, useTimeout } from '@aix/hooks';
import { ref, watch, toValue, type Ref, type MaybeRefOrGetter } from 'vue';
import { onScopeDisposeSafe } from '../utils/onScopeDisposeSafe';

/** 滚动静默多久算「定位结束」（ms）：平滑滚动的帧间隔远小于此值 */
const SCROLL_QUIET_MS = 150;
/** 闸门最长持有时长（ms）：滚动一直不停（用户接管 / 惯性）时的兜底，闸门不得永久持有 */
const MAX_NAVIGATE_LOCK_MS = 2000;

export interface UseVisibleMessageOptions {
  /** 滚动容器（IntersectionObserver 的 root）；为 null 时空转 */
  root: MaybeRefOrGetter<HTMLElement | null>;
  /**
   * 候选消息 id 列表，**必须与文档流顺序一致**（即消息自上而下的顺序）——
   * 活跃项按本列表的顺序取「仍在视口内、最靠后的一条」。
   * 列表变化时重建观察目标（虚拟列表下 DOM 增删频繁）。
   */
  ids: MaybeRefOrGetter<string[]>;
  /** 是否启用，默认 true */
  enabled?: MaybeRefOrGetter<boolean>;
}

export interface UseVisibleMessageReturn {
  /** 当前活跃 messageId：视口内最靠下的一条（对话场景下即用户正在读的位置） */
  activeId: Readonly<Ref<string | undefined>>;
  /**
   * 程序化定位期间调用，屏蔽观测回写，避免滚动过程把高亮抢走。
   * 闸门会在**滚动静默后自动解除**，正常路径无需再调 endNavigate。
   */
  beginNavigate: (id: string) => void;
  /** 提前解闸（如定位失败，根本不会发生滚动）。传 id 时仅当它仍是当前目标才解闸（防连点提前解闸） */
  endNavigate: (id?: string) => void;
}

/**
 * 「视口内最靠下的消息」观测。
 *
 * 用 IntersectionObserver 而非滚动时轮询 getBoundingClientRect：虚拟列表回收行时
 * 观察自动失效，无需手动摘除，也不在滚动主线程上做批量测量。
 *
 * isNavigating 闸门：点击大纲跳转时滚动会依次穿过若干消息，若不屏蔽，观测会把
 * activeId 改成途经的消息，导致高亮先乱跳再落定。定位期间只认目标 id。
 */
export function useVisibleMessage(options: UseVisibleMessageOptions): UseVisibleMessageReturn {
  const { root, ids, enabled = true } = options;
  const activeId = ref<string | undefined>(undefined);

  // 定位期间锁定目标：观测回写一律忽略，直到滚动静默（或兜底超时）。
  // 用 ref 而非普通变量：下方滚动监听按它的真假值挂载 / 摘除。
  const navigatingTo = ref<string | null>(null);

  // 带 id 校验：连点两条刻度时，前一次定位的解闸不能解掉后一次的闸门
  // （navigatingTo 已被后者覆盖，此时清空会让后者的滚动全程失去保护）
  const endNavigate = (id?: string) => {
    if (id != null && navigatingTo.value !== id) return;
    navigatingTo.value = null;
    stopQuiet();
    stopMaxLock();
  };

  // 「滚动静默即定位结束」：不能拿 scrollToBubble 的 resolve 当结束信号——它在**目标行挂载**
  // 时就 resolve，而 smooth 滚动的动画还要几百毫秒，提前解闸会让观测在动画途中把高亮抢走。
  const { start: startQuiet, stop: stopQuiet } = useTimeout(
    () => endNavigate(navigatingTo.value ?? undefined),
    SCROLL_QUIET_MS,
  );
  // 兜底：滚动一直不停（用户中途接管滚轮 / 惯性滚动）时也必须解闸，否则活跃态永久冻结
  const { start: startMaxLock, stop: stopMaxLock } = useTimeout(
    () => endNavigate(navigatingTo.value ?? undefined),
    MAX_NAVIGATE_LOCK_MS,
  );

  const beginNavigate = (id: string) => {
    navigatingTo.value = id;
    activeId.value = id;
    startQuiet();
    startMaxLock();
  };

  // 滚动监听常挂在 root 上、由处理器判闸门，而不是「按 navigatingTo 动态挂载」——
  // 后者的挂载要等 watch 刷新，而平滑滚动的首个 scroll 事件可能就在这之前到达，
  // 静默计时便不会被推后、闸门提前解除。常挂 + passive 的代价可忽略。
  useEventListener(
    () => toValue(root),
    'scroll',
    () => {
      if (navigatingTo.value) startQuiet();
    },
    { passive: true },
  );

  let observer: IntersectionObserver | null = null;
  // 行挂载/卸载的补挂观测器：虚拟列表滚动时新挂载的行不改变 ids，
  // 若只在 setup 时一次性 querySelector，新行永远进不了观测集合，
  // intersecting 只减不增 → 最终为空 → 活跃项冻结在旧值
  let domObserver: MutationObserver | null = null;
  // 当前仍在视口内的目标 id 集合。
  // 刻意**不存坐标**：IntersectionObserver 在 threshold:0 下只在进出视口时投递记录，
  // 一直停在视口内的行不会再有新记录，存下的 boundingClientRect.top 立刻过期；
  // 连续下滚时各行都是「从下沿进入」，记录到的 top 彼此接近，按坐标比大小会退化成
  // 「谁先进集合谁赢」。消息在文档流里天生自上而下，直接按 ids 顺序取最靠后的一条即可，
  // 无测量、无过期。
  const intersecting = new Set<string>();
  // 已观测的元素集合：避免同一元素被重复 observe，并支持卸载时精确摘除
  const observed = new Set<Element>();

  /** 取「仍在视口内、消息顺序最靠后」的一条（对话场景下即用户正在读的位置） */
  const pickLowest = () => {
    if (navigatingTo.value) return;
    const order = toValue(ids);
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i]!;
      if (intersecting.has(id)) {
        activeId.value = id;
        return;
      }
    }
  };

  const teardown = () => {
    observer?.disconnect();
    observer = null;
    domObserver?.disconnect();
    domObserver = null;
    intersecting.clear();
    observed.clear();
  };

  const setup = () => {
    teardown();
    if (!toValue(enabled)) return;
    const rootEl = toValue(root);
    if (!rootEl) return;
    // jsdom / SSR 无 IntersectionObserver 时安全空转（与 useAutoScroll 对 ResizeObserver 同策略）
    if (typeof IntersectionObserver === 'undefined') return;

    observer = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          const id = (r.target as HTMLElement).dataset.aixMessageId;
          if (!id) continue;
          if (r.isIntersecting) intersecting.add(id);
          else intersecting.delete(id);
        }
        pickLowest();
      },
      { root: rootEl, threshold: 0 },
    );

    // 首屏：观测此刻已挂载的目标行
    const wanted = new Set(toValue(ids));
    const observeIfWanted = (el: Element) => {
      const id = (el as HTMLElement).dataset?.aixMessageId;
      if (!id || !wanted.has(id) || observed.has(el)) return;
      observed.add(el);
      observer?.observe(el);
    };
    /** 摘除观测；返回是否真的摘到了东西（供调用方判断要不要重算活跃项） */
    const forgetEl = (el: Element): boolean => {
      if (!observed.delete(el)) return false;
      observer?.unobserve(el);
      const id = (el as HTMLElement).dataset?.aixMessageId;
      if (id) intersecting.delete(id);
      return true;
    };
    for (const el of rootEl.querySelectorAll<HTMLElement>('[data-aix-message-id]')) {
      observeIfWanted(el);
    }

    // 虚拟列表滚动会持续增删行，且不改变 ids —— 必须在 DOM 变化时补挂/摘除，
    // 否则首屏之后进入视口的行永远不被观测（详见上方 domObserver 声明处注释）。
    // 行是 root 的深层后代（Virtualizer 包了若干层），故须 subtree。
    if (typeof MutationObserver === 'undefined') return;
    domObserver = new MutationObserver((records) => {
      let changed = false;
      for (const r of records) {
        for (const n of r.removedNodes) {
          if (!(n instanceof Element)) continue;
          // 只有真的摘掉了被观测的行才需要重算：observe 的是 subtree，流式期 markdown 的
          // TransitionGroup 会持续增删块元素，无条件置位会让每个 chunk 都空跑一次 pickLowest
          if (forgetEl(n)) changed = true;
          for (const el of n.querySelectorAll('[data-aix-message-id]')) {
            if (forgetEl(el)) changed = true;
          }
        }
        for (const n of r.addedNodes) {
          if (!(n instanceof Element)) continue;
          observeIfWanted(n);
          for (const el of n.querySelectorAll('[data-aix-message-id]')) observeIfWanted(el);
        }
      }
      // 行被移除会让 intersecting 缩小，需重算活跃项（新增行等 IO 异步投递即可）
      if (changed) pickLowest();
    });
    domObserver.observe(rootEl, { childList: true, subtree: true });
  };

  // root / ids / enabled 任一变化都重建观察集合（虚拟列表滚动会增删 DOM）。
  // ids 用 join 后的字符串参与比较：调用方通常以 .map 派生该数组，每次求值都是新引用，
  // 直接比引用会让流式期间每个 chunk 都 disconnect + 重建一次 observer。
  watch([() => toValue(root), () => toValue(ids).join(' '), () => toValue(enabled)], () => setup(), {
    immediate: true,
    flush: 'post',
  });

  onScopeDisposeSafe(teardown);

  return { activeId, beginNavigate, endNavigate };
}
