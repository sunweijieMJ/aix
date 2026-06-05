/** 一个顶层 markdown 块（流式渲染单元） */
export interface StreamingBlock {
  /** 稳定 key：跨帧复用，用于 diff 复用与 TransitionGroup 动画 key */
  id: string;
  /** 该顶层块对应的源码切片 */
  source: string;
}

/**
 * 据上一帧 blocks 与本帧顶层块源码切片，产出新块列表并**按位置复用上一帧 id**。
 *
 * 流式（append-only）下顶层块按位置稳定：committed 前缀块复用原 id（diff 复用、不重渲染），
 * 末块（活跃块）复用同一 id（内容增长不重 mount），新出现的末块分配新 id（mount → 入场动画）。
 * 由此"已完成块冻结、新块淡入"的效果由稳定 id + 组件 props diff 自然得到，无需显式标记。
 */
export function reconcileStreamingBlocks(
  prev: StreamingBlock[],
  slices: string[],
  genId: () => string,
): StreamingBlock[] {
  return slices.map((source, i) => ({ id: prev[i]?.id ?? genId(), source }));
}
