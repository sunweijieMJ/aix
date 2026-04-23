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
    :style="{ filter: `blur(3px)`, opacity: 0.4 }"
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
    @mousedown.stop="onPathMousedown"
    @contextmenu.prevent.stop="onPathContextmenu"
  />

  <EdgeLabelRenderer>
    <!-- 上下文菜单（隐藏触发器，仅通过 show(event) 虚拟元素定位打开） -->
    <ContextMenu ref="contextMenuRef" popper-class="aix-edge-menu" @command="onCommand">
      <span class="aix-edge-menu__hidden-trigger" aria-hidden="true" />
      <template #menu>
        <DropdownItem command="delete" label="删除" />
      </template>
    </ContextMenu>

    <template v-if="selected">
      <div
        v-for="(wp, i) in waypoints"
        :key="i"
        class="aix-edge-waypoint nodrag nopan"
        :style="{
          transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
        }"
        @mousedown.stop="startDrag($event, i)"
        @contextmenu.prevent.stop="removeWaypoint(i)"
      />
    </template>
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
import { computed, inject, onBeforeUnmount, ref, type Ref } from 'vue';
import {
  DEFAULT_CIRCLE_SIZE,
  DEFAULT_HEXAGON_SIZE,
  type EdgeData,
  type NodeData,
} from '../../types';

defineOptions({ name: 'AixColorEdge' });

const props = defineProps<EdgeProps<EdgeData>>();
const { removeEdges, updateEdgeData, screenToFlowCoordinate, findNode } = useVueFlow();

const edgeData = computed<EdgeData>(() => props.data ?? {});
const color = computed(() => edgeData.value.color || 'var(--aix-flowGraphEdgeColor, #86909c)');
const markerId = computed(() => `arrow-${props.id}`);
const waypoints = computed(() => edgeData.value.waypoints ?? []);
const sharedColors = computed(() => edgeData.value.sharedColors ?? []);
const gradientId = computed(() => `grad-${props.id}`);
/** 渐变 stops：当前色 → 各共用色均匀分布 */
const gradientStops = computed(() => [color.value, ...sharedColors.value]);

const edgesDeletable = inject<Ref<boolean>>('flowEdgesDeletable', ref(true));
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
  return adjustToNodeEdge(c.x, c.y, from.x, from.y, targetRadius.value + 6);
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

/** 移除指定索引的拐点 */
function removeWaypoint(index: number) {
  const wps = waypoints.value.filter((_, i) => i !== index);
  updateEdgeData(props.id, { ...edgeData.value, waypoints: wps });
}

/** 路径左键按下：选中态下在最近的线段插入新拐点并进入拖拽 */
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
  startDrag(event, insertIndex, pos);
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
  const startScreen = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  const offsetX = startFlow.x - startScreen.x;
  const offsetY = startFlow.y - startScreen.y;

  function onMove(e: MouseEvent) {
    const flowPos = screenToFlowCoordinate({ x: e.clientX, y: e.clientY });
    const newPos = { x: flowPos.x + offsetX, y: flowPos.y + offsetY };
    const updated = waypoints.value.map((wp, i) => (i === index ? newPos : wp));
    updateEdgeData(props.id, { ...edgeData.value, waypoints: updated });
  }

  function onUp() {
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
  border: 2px solid var(--aix-flowGraphBrand, #1546f2);
  border-radius: 50%;
  background: var(--aix-colorBgElevated, #fff);
  cursor: move;
  pointer-events: all;
}
</style>
