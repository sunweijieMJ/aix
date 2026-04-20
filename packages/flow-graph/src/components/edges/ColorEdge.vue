<template>
  <defs>
    <marker :id="markerId" markerWidth="6" markerHeight="6" refX="5" refY="1.5" orient="auto">
      <path d="M0,0 L0,3 L5,1.5 z" :fill="color" />
    </marker>
  </defs>

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
    :stroke="color"
    stroke-width="2"
    stroke-linecap="round"
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
        :style="{ transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)` }"
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
import { computed, onBeforeUnmount, ref } from 'vue';
import type { EdgeData, NodeData } from '../../types';

defineOptions({ name: 'AixColorEdge' });

const props = defineProps<EdgeProps>();
const { removeEdges, updateEdgeData, screenToFlowCoordinate, viewport, findNode } = useVueFlow();

const edgeData = computed(() => (props.data as EdgeData | undefined) ?? {});
const color = computed(() => edgeData.value.color || 'var(--aix-flowGraphEdgeColor, #86909c)');
const markerId = computed(() => `arrow-${props.id}`);
const waypoints = computed(() => edgeData.value.waypoints ?? []);

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
  const size = data?.size ?? (node?.type === 'hexagon' ? 40 : 28);
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

const adjustedSource = computed(() => {
  const wps = waypoints.value;
  const toX = wps.length ? wps[0]!.x : props.targetX;
  const toY = wps.length ? wps[0]!.y : props.targetY;
  return adjustToNodeEdge(props.sourceX, props.sourceY, toX, toY, sourceRadius.value);
});

const adjustedTarget = computed(() => {
  const wps = waypoints.value;
  const fromX = wps.length ? wps[wps.length - 1]!.x : props.sourceX;
  const fromY = wps.length ? wps[wps.length - 1]!.y : props.sourceY;
  return adjustToNodeEdge(props.targetX, props.targetY, fromX, fromY, targetRadius.value);
});

/** 有 waypoints 时使用圆角折线路径；无 waypoints 时为直线 */
const path = computed(() => {
  const wps = waypoints.value;
  const src = adjustedSource.value;
  const tgt = adjustedTarget.value;
  if (!wps.length) return `M${src.x},${src.y} L${tgt.x},${tgt.y}`;
  const pts = [src, ...wps, tgt];
  const r = 16;
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
  contextMenuRef.value?.show(event);
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
  const pts = [adjustedSource.value, ...waypoints.value, adjustedTarget.value];
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
  const startX = event.clientX;
  const startY = event.clientY;
  const origin = originPos ?? { ...waypoints.value[index]! };

  function onMove(e: MouseEvent) {
    const zoom = viewport.value.zoom;
    const updated = waypoints.value.map((wp, i) =>
      i === index
        ? { x: origin.x + (e.clientX - startX) / zoom, y: origin.y + (e.clientY - startY) / zoom }
        : wp,
    );
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
  width: 10px;
  height: 10px;
  border: 2px solid var(--aix-flowGraphBrand, #1546f2);
  border-radius: 50%;
  background: var(--aix-colorBgElevated, #fff);
  cursor: move;
  pointer-events: all;
}
</style>
