<template>
  <defs>
    <marker :id="markerId" markerWidth="6" markerHeight="6" refX="0" refY="1.5" orient="auto">
      <path d="M0,0 L0,3 L5,1.5 z" :fill="color" />
    </marker>
    <!-- 共用线段渐变：沿线段方向从当前色渐变到其他路径色 -->
    <linearGradient
      v-if="sharedColors.length"
      :id="gradientId"
      :x1="adjustedSource.x"
      :y1="adjustedSource.y"
      :x2="adjustedTarget.x"
      :y2="adjustedTarget.y"
      gradientUnits="userSpaceOnUse"
    >
      <stop
        v-for="(c, i) in gradientStops"
        :key="i"
        :offset="`${(i / (gradientStops.length - 1)) * 100}%`"
        :stop-color="c"
      />
    </linearGradient>
  </defs>

  <!-- 外部控制的高亮光晕（通过 edge.data.selecting） -->
  <path
    v-if="edgeData.selecting"
    :d="path"
    fill="none"
    :stroke="color"
    stroke-width="6"
    stroke-linecap="round"
    :style="{ filter: `blur(3px)`, opacity: edgeData.dimmed ? 0.16 : 0.4 }"
  />
  <!-- 透明宽命中区域，方便点击选中；mousedown 在路径上插入新 waypoint -->
  <path
    :d="path"
    fill="none"
    stroke="transparent"
    stroke-width="12"
    @mousedown.stop="onPathMousedown"
    @contextmenu.prevent.stop="onPathContextmenu"
  />
  <path
    :d="path"
    fill="none"
    :stroke="sharedColors.length ? `url(#${gradientId})` : color"
    stroke-width="2"
    stroke-linecap="butt"
    :marker-end="`url(#${markerId})`"
    :class="{ 'aix-color-edge--dimmed': edgeData.dimmed }"
    @mousedown.stop="onPathMousedown"
    @contextmenu.prevent.stop="onPathContextmenu"
  />

  <EdgeLabelRenderer>
    <!-- 上下文菜单（隐藏触发器，仅通过 show(event) 虚拟元素定位打开） -->
    <ContextMenu ref="contextMenuRef" popper-class="aix-edge-menu" @command="onCommand">
      <span class="aix-edge-menu__hidden-trigger" aria-hidden="true" />
      <template #menu>
        <DropdownItem command="delete" :label="t.delete" />
      </template>
    </ContextMenu>

    <div
      v-for="(wp, i) in waypoints"
      :key="i"
      class="aix-edge-waypoint nodrag nopan"
      :class="{ 'aix-edge-waypoint--selected': selectedWaypointIndex === i }"
      :style="{
        transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
      }"
      @mousedown.stop="onWaypointMousedown($event, i)"
      @contextmenu.prevent.stop="removeWaypoint(i)"
    />
  </EdgeLabelRenderer>
</template>

<script setup lang="ts">
/**
 * 彩色折线边：
 * - 自动根据起止节点实际尺寸修正箭头贴边；
 * - 支持 waypoints（圆角折线），路径上按住左键插入新拐点并拖动，右键删除拐点；
 * - 选中时暴露拐点 handle；右键边本身弹出“删除”菜单（由 @aix/popper ContextMenu 承载）。
 */
import { ContextMenu, DropdownItem, type ContextMenuExpose } from '@aix/popper';
import { EdgeLabelRenderer, useVueFlow } from '@vue-flow/core';
import type { EdgeProps } from '@vue-flow/core';
import { computed, inject, onBeforeUnmount, ref } from 'vue';
import zhCN from '../../locale/zh-CN';
import {
  DEFAULT_CIRCLE_SIZE,
  DEFAULT_HEXAGON_SIZE,
  FlowActiveWaypointKey,
  FlowEdgesDeletableKey,
  FlowGraphLocaleKey,
  FlowSnapContextKey,
  type EdgeData,
  type FlowActiveWaypoint,
  type NodeData,
} from '../../types';

/** 与 `<marker markerWidth>` 一致的箭头视觉长度，用于让线段终点为箭头预留空间 */
const ARROW_MARKER_LENGTH = 6;

defineOptions({ name: 'AixColorEdge' });

const props = defineProps<EdgeProps<EdgeData>>();
const { removeEdges, updateEdgeData, screenToFlowCoordinate, findNode } = useVueFlow();
const snap = inject(FlowSnapContextKey, null);
/** i18n：从 FlowGraph 注入；脱离 FlowGraph 单独使用时回退中文兜底 */
const t = inject(
  FlowGraphLocaleKey,
  computed(() => zhCN),
);
/**
 * 本 FlowGraph 实例共享的"当前选中拐点"状态。由 FlowGraph 创建并 provide，
 * `onKeyDelete` 与 `onGlobalMousedown` 单点处理 Delete 删除与高亮重置。
 * inject 默认值仅在脱离 FlowGraph 渲染时兜底（如单测直接 mount ColorEdge），生产路径必有 provider。
 */
const activeWaypoint = inject(FlowActiveWaypointKey, ref<FlowActiveWaypoint | null>(null));

/** 本边拐点的选中索引（与全局选中匹配时高亮） */
const selectedWaypointIndex = computed(() =>
  activeWaypoint.value?.edgeId === props.id ? activeWaypoint.value.index : null,
);

/** 开启吸附时把坐标对齐到栅格 */
function snapPoint(p: { x: number; y: number }): { x: number; y: number } {
  if (!snap?.snapEnabled.value) return p;
  const step = snap.gridSize.value;
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

const edgeData = computed<EdgeData>(() => props.data ?? {});
const color = computed(() => edgeData.value.color || 'var(--aix-flowGraphEdgeColor, #86909c)');
const markerId = computed(() => `arrow-${props.id}`);
const waypoints = computed(() => edgeData.value.waypoints ?? []);
const sharedColors = computed(() => edgeData.value.sharedColors ?? []);
const gradientId = computed(() => `grad-${props.id}`);
/** 渐变 stops：当前色 → 各共用色均匀分布 */
const gradientStops = computed(() => [color.value, ...sharedColors.value]);

const edgesDeletable = inject(
  FlowEdgesDeletableKey,
  computed(() => true),
);
const deletable = computed(() => edgeData.value.deletable !== false && edgesDeletable.value);

const contextMenuRef = ref<ContextMenuExpose | null>(null);

/** 箭头视觉余量（px），避免箭头与节点边缘相交 */
const EDGE_PADDING = 4;

/**
 * 从目标节点读取尺寸算半径（加视觉余量）。
 * data.size 缺省时按节点类型退回到默认值（hexagon=40，其他=28）。
 */
function radiusOf(nodeId: string): number {
  const node = findNode(nodeId);
  const data = node?.data as NodeData | undefined;
  const size =
    data?.size ?? (node?.type === 'hexagon' ? DEFAULT_HEXAGON_SIZE : DEFAULT_CIRCLE_SIZE);
  return size / 2 + EDGE_PADDING;
}

const sourceRadius = computed(() => radiusOf(props.source));
const targetRadius = computed(() => radiusOf(props.target));

/**
 * Handle 位置即节点圆心；沿指向对端方向走 radius 得到节点边缘交点。
 * 让线段起止贴合节点边缘而不是从圆心出发。
 */
function adjustToNodeEdge(
  handleX: number,
  handleY: number,
  toX: number,
  toY: number,
  radius: number,
): { x: number; y: number } {
  const dx = toX - handleX;
  const dy = toY - handleY;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: handleX, y: handleY };
  return {
    x: handleX + (dx / len) * radius,
    y: handleY + (dy / len) * radius,
  };
}

/** 节点中心坐标（从 findNode 读取，比 handle 坐标更准确） */
function centerOf(nodeId: string): { x: number; y: number } {
  const node = findNode(nodeId);
  const data = node?.data as NodeData | undefined;
  const size =
    data?.size ?? (node?.type === 'hexagon' ? DEFAULT_HEXAGON_SIZE : DEFAULT_CIRCLE_SIZE);
  return { x: (node?.position.x ?? 0) + size / 2, y: (node?.position.y ?? 0) + size / 2 };
}

const adjustedSource = computed(() => {
  const wps = waypoints.value;
  const c = centerOf(props.source);
  const to = wps.length ? wps[0]! : centerOf(props.target);
  return adjustToNodeEdge(c.x, c.y, to.x, to.y, sourceRadius.value);
});

const adjustedTarget = computed(() => {
  const wps = waypoints.value;
  const c = centerOf(props.target);
  const from = wps.length ? wps[wps.length - 1]! : centerOf(props.source);
  return adjustToNodeEdge(c.x, c.y, from.x, from.y, targetRadius.value + ARROW_MARKER_LENGTH);
});

/** 有 waypoints 时使用圆角折线路径；无 waypoints 时为直线 */
const path = computed(() => {
  const wps = waypoints.value;
  const src = adjustedSource.value;
  const tgt = adjustedTarget.value;
  if (!wps.length) return `M${src.x},${src.y} L${tgt.x},${tgt.y}`;
  const pts = [src, ...wps, tgt];
  const r = 6;
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    // 相邻点重合时除零会产生 NaN，整段 path 失效，退化为直线连接
    if (inLen === 0 || outLen === 0) {
      d += ` L${cur.x},${cur.y}`;
      continue;
    }
    const rad = Math.min(r, inLen / 2, outLen / 2);
    const p1x = cur.x - ((cur.x - prev.x) / inLen) * rad;
    const p1y = cur.y - ((cur.y - prev.y) / inLen) * rad;
    const p2x = cur.x + ((next.x - cur.x) / outLen) * rad;
    const p2y = cur.y + ((next.y - cur.y) / outLen) * rad;
    d += ` L${p1x},${p1y} Q${cur.x},${cur.y} ${p2x},${p2y}`;
  }
  d += ` L${pts[pts.length - 1]!.x},${pts[pts.length - 1]!.y}`;
  return d;
});

let cleanupDrag: (() => void) | null = null;

/** 打开删除菜单（通过 ContextMenu 的虚拟元素定位） */
function onPathContextmenu(event: MouseEvent) {
  if (deletable.value) contextMenuRef.value?.show(event);
}

onBeforeUnmount(() => {
  cleanupDrag?.();
});

/** 菜单 command 派发：仅响应 'delete' */
function onCommand(command: string | number) {
  if (command === 'delete') removeEdges(props.id);
}

/** 移除指定索引的拐点；若被移除的拐点是当前高亮项，同步清空全局选中 */
function removeWaypoint(index: number) {
  const wps = waypoints.value.filter((_, i) => i !== index);
  updateEdgeData(props.id, { ...edgeData.value, waypoints: wps });
  if (activeWaypoint.value?.edgeId === props.id && activeWaypoint.value.index === index) {
    activeWaypoint.value = null;
  }
}

/** 路径左键按下：选中态下在最近的线段插入新拐点并进入拖拽（拖拽期间自由移动，放开时吸附） */
function onPathMousedown(event: MouseEvent) {
  if (!props.selected || event.button !== 0) return;
  const pos = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  // 距源点或目标点太近时不插入拐点（避开箭头区域）
  const distToTarget = Math.hypot(pos.x - props.targetX, pos.y - props.targetY);
  const distToSource = Math.hypot(pos.x - props.sourceX, pos.y - props.sourceY);
  if (distToTarget < 20 || distToSource < 20) return;
  const pts = [
    { x: props.sourceX, y: props.sourceY },
    ...waypoints.value,
    { x: props.targetX, y: props.targetY },
  ];
  let insertIndex = waypoints.value.length;
  let minDist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(pos, pts[i]!, pts[i + 1]!);
    if (d < minDist) {
      minDist = d;
      insertIndex = i;
    }
  }
  const wps = [...waypoints.value];
  wps.splice(insertIndex, 0, pos);
  updateEdgeData(props.id, { ...edgeData.value, waypoints: wps });
  activeWaypoint.value = { edgeId: props.id, index: insertIndex };
  startDrag(event, insertIndex, pos);
}

/**
 * 拐点 mousedown：写入全局 activeWaypoint 后进入拖拽。
 * 不需要主动取消边的 selected —— FlowGraph.onKeyDelete 的拐点分支已 early return + preventDefault，
 * 不会落到边/节点删除分支。
 */
function onWaypointMousedown(event: MouseEvent, index: number) {
  if (event.button !== 0) return;
  activeWaypoint.value = { edgeId: props.id, index };
  startDrag(event, index);
}

/** 点到线段的最短距离 */
function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * 启动拐点拖拽：监听全局 mousemove/mouseup；卸载函数挂到 cleanupDrag 保证可中断。
 * @param originPos - 插入拐点时传入的初始位置；否则取 waypoints[index]
 */
function startDrag(event: MouseEvent, index: number, originPos?: { x: number; y: number }) {
  cleanupDrag?.();
  const startFlow = originPos ?? { ...waypoints.value[index]! };
  // 鼠标按下点的 flow 坐标，用于计算拖拽时的位移补偿
  const startMouseFlow = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  const offsetX = startFlow.x - startMouseFlow.x;
  const offsetY = startFlow.y - startMouseFlow.y;

  // 拖拽过程中自由移动（不吸附），与节点拖拽行为一致；mouseup 时再一次性吸附到栅格
  let lastPos = { ...startFlow };

  function onMove(e: MouseEvent) {
    const flowPos = screenToFlowCoordinate({ x: e.clientX, y: e.clientY });
    const newPos = { x: flowPos.x + offsetX, y: flowPos.y + offsetY };
    lastPos = newPos;
    const updated = waypoints.value.map((wp, i) => (i === index ? newPos : wp));
    updateEdgeData(props.id, { ...edgeData.value, waypoints: updated });
  }

  function onUp() {
    // 放开时对齐栅格（吸附），未开启吸附则保持原位
    const snapped = snapPoint(lastPos);
    const needSnap = snapped.x !== lastPos.x || snapped.y !== lastPos.y;
    const finalPos = needSnap ? snapped : lastPos;
    const baseWps = needSnap
      ? waypoints.value.map((wp, i) => (i === index ? snapped : wp))
      : waypoints.value;
    // 与相邻拐点完全重合时合并（去除当前拐点），避免冗余点导致圆角失效
    const prev = baseWps[index - 1];
    const next = baseWps[index + 1];
    const coincide =
      (prev && prev.x === finalPos.x && prev.y === finalPos.y) ||
      (next && next.x === finalPos.x && next.y === finalPos.y);
    if (coincide) {
      const dedupped = baseWps.filter((_, i) => i !== index);
      updateEdgeData(props.id, { ...edgeData.value, waypoints: dedupped });
      if (activeWaypoint.value?.edgeId === props.id && activeWaypoint.value.index === index) {
        activeWaypoint.value = null;
      }
    } else if (needSnap) {
      updateEdgeData(props.id, { ...edgeData.value, waypoints: baseWps });
    }
    cleanupDrag?.();
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  cleanupDrag = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    cleanupDrag = null;
  };
}
</script>

<style>
.aix-edge-menu__hidden-trigger {
  display: none;
}

.aix-edge-waypoint {
  position: absolute;
  top: 0;
  left: 0;
  width: 10px;
  height: 10px;
  transition: filter 0.2s ease;
  border: 2px solid var(--aix-flowGraphBrand, #1546f2);
  border-radius: 50%;
  background: var(--aix-colorBgElevated, #fff);
  cursor: move;
  pointer-events: all;
}

/* 选中态：圆心填品牌色 + drop-shadow 光晕（与节点 active 的视觉语言一致） */
.aix-edge-waypoint--selected {
  background: var(--aix-flowGraphBrand, #1546f2);
  filter: drop-shadow(0 0 4px var(--aix-flowGraphBrand, #1546f2));
}

/* dim 态：半透明。SVG <path> 不支持 backdrop-filter，因此 edge 仅做透明降级，
   节点的 backdrop-filter 已足以构成「画布失焦」的视觉语义。
   业务侧可覆盖 --aix-flowGraphDimmedOpacity 调整强度。 */
.aix-color-edge--dimmed {
  opacity: var(--aix-flowGraphDimmedOpacity, 0.4);
}
</style>
