import { useTimeout, useEventListener } from '@aix/hooks';
import { ref, watch, toValue, type Ref, type MaybeRefOrGetter } from 'vue';
import type { ConfirmTimeoutConfig } from '../types';

export interface UseConfirmDeadlineOptions {
  /**
   * 卡片创建时刻（epoch ms）；缺省 → 整条时间线不启用。
   * 变更即视为「新一轮计时」：已触发标记随之清空（宿主可据此为同一张卡续期）。
   */
  createdAt: MaybeRefOrGetter<number | undefined>;
  /** 时间线配置；缺省 → 不启用 */
  timeout: MaybeRefOrGetter<ConfirmTimeoutConfig | undefined>;
  /** 是否仍可交互（确认卡为 state==='awaiting'）；false → 停表 */
  active: MaybeRefOrGetter<boolean>;
  /** 到达 hintAt */
  onHint?: () => void;
  /** 到达 autoFillAt */
  onAutoFill?: () => void;
  /** 到达 autoSubmitAt */
  onAutoSubmit?: () => void;
}

export interface UseConfirmDeadlineReturn {
  /** hintAt 是否已触发（驱动提示文案显隐） */
  hinted: Readonly<Ref<boolean>>;
  /** autoFillAt 是否已触发（驱动「已自动填充」标记） */
  autoFilled: Readonly<Ref<boolean>>;
  /** 撤销整条时间线：任何手动交互调用，此后任何节点都不再触发（不可恢复） */
  cancel: () => void;
}

/** 时间线节点（按先后顺序声明，flush 依此序补发） */
const NODES = [
  { key: 'hint', at: 'hintAt' },
  { key: 'autoFill', at: 'autoFillAt' },
  { key: 'autoSubmit', at: 'autoSubmitAt' },
] as const;

type NodeKey = (typeof NODES)[number]['key'];

/**
 * 确认卡超时时间线（提示 → 自动填充 → 自动提交）。
 *
 * 刻意设计成**块类型无关**：等 tool_use 的 `awaiting-approval` 落地时复用同一套 deadline，
 * 只写自己的 UI，不重复机制。
 *
 * 三重兜底（后台标签页的 setTimeout 会被节流甚至挂起，这是正确性而非锦上添花）：
 * 1. 全部按 `createdAt` 的**绝对时刻**计算剩余量，不累加相对延时——定时器晚到多久都不会漂移；
 * 2. `visibilitychange` 回前台时按已流逝时间重排；
 * 3. 每次排程前先 flush：已过点却未触发的节点按序**立即补发**，再为下一个未到点的节点排程。
 *    这条同时覆盖两个场景——「挂载时 createdAt 已远超时」（被遗弃的历史 awaiting 卡进入
 *    即走完时间线，不会留在可交互态），以及「定时器一次跳过多个节点」（autoSubmit 触发前
 *    一定先补上 autoFill，答案不会因跳点而丢）。
 *
 * `createdAt` 变更被解释为**续期**（宿主把同一张卡的计时起点前推）：已触发标记与
 * `hinted`/`autoFilled` 一并清空，新一轮从头计时。反之 `cancel()` 是不可逆的——它表示
 * 用户已手动接管，续期也不该把自动代填/代交放回来。
 *
 * 注意：宿主若不希望历史卡片在重新挂载时被自动提交，应在持久化时就把已处理的卡片落为
 * `submitted`/`expired`（`active` 为 false 即整条时间线不启用）。
 */
export function useConfirmDeadline(options: UseConfirmDeadlineOptions): UseConfirmDeadlineReturn {
  const { createdAt, timeout, active } = options;
  const hinted = ref(false);
  const autoFilled = ref(false);
  const fired = new Set<NodeKey>();
  let cancelled = false;
  // 上一轮计时的起点，用于识别「宿主把 createdAt 改了」= 续期，见下方 flush 内的重置
  let lastBase: number | undefined;

  // useTimeout 的 delay 在每次 start() 时求值：把「到下一个节点还剩多少 ms」写进 ref 再 start，
  // 即可用同一个（带 scope 自动清理的）定时器逐节点排程。
  const nextDelay = ref(0);
  const { start, stop } = useTimeout(() => flush(), nextDelay);

  const fire = (key: NodeKey) => {
    fired.add(key);
    if (key === 'hint') {
      hinted.value = true;
      options.onHint?.();
    } else if (key === 'autoFill') {
      autoFilled.value = true;
      options.onAutoFill?.();
    } else {
      options.onAutoSubmit?.();
    }
  };

  /** 补发已过点的节点 + 为下一个未到点的节点排程；停用态（取消 / 非 awaiting / 缺配置）直接停表 */
  function flush() {
    stop();
    if (cancelled) return;
    const base = toValue(createdAt);
    const config = toValue(timeout);
    // createdAt 变了 = 宿主为这张卡续期：必须连同已触发标记一起清空，否则上一轮已触发的节点
    // 会被 fired 吞掉。续期最常见的场景恰恰是「卡片已走完时间线、宿主再延一次」，此时三个节点
    // 全在 fired 里，nextAt 停在 Infinity，整条时间线静默失效——watch 监听了 createdAt
    // 却不响应它的变化，契约上说不通。
    // （首轮 base !== lastBase 也会走到这里，但此时 fired 必为空、两个 ref 已是 false，是 no-op）
    if (base !== lastBase) {
      lastBase = base;
      fired.clear();
      hinted.value = false;
      autoFilled.value = false;
    }
    if (!toValue(active) || base == null || !config) return;

    const elapsed = Date.now() - base;
    let nextAt = Number.POSITIVE_INFINITY;
    for (const node of NODES) {
      const at = config[node.at];
      if (at == null || fired.has(node.key)) continue;
      if (at <= elapsed) fire(node.key);
      else nextAt = Math.min(nextAt, at);
    }
    // 回调可能同步改变卡片状态（如 autoSubmit 后宿主置 submitting）→ 重新确认仍需排程
    if (nextAt === Number.POSITIVE_INFINITY || cancelled || !toValue(active)) return;
    nextDelay.value = Math.max(0, base + nextAt - Date.now());
    start();
  }

  watch([() => toValue(active), () => toValue(createdAt), () => toValue(timeout)], () => flush(), {
    immediate: true,
  });

  // 环境守卫：SSR / 非浏览器环境无 document，传 null 即不绑定（useEventListener 支持）
  useEventListener(
    () => (typeof document === 'undefined' ? null : document),
    'visibilitychange',
    () => {
      if (document.visibilityState !== 'hidden') flush();
    },
  );

  const cancel = () => {
    cancelled = true;
    stop();
  };

  return { hinted, autoFilled, cancel };
}
