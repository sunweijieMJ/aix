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
    <!-- 右键删除 popper -->
    <div
      v-if="contextMenu"
      class="aix-edge-menu nodrag nopan"
      :style="{
        transform: `translate(-50%, -50%) translate(${contextMenu.x}px, ${contextMenu.y}px)`,
      }"
      @click.stop
    >
      <button class="aix-edge-menu__item aix-edge-menu__item--delete" @click="onDeleteEdge">
        删除
      </button>
    </div>

    <!-- 可拖拽控制点 -->
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
import { EdgeLabelRenderer, useVueFlow } from '@vue-flow/core';
import type { EdgeProps } from '@vue-flow/core';
import { computed, onUnmounted, ref } from 'vue';
import type { EdgeData } from '../../types';

const props = defineProps<EdgeProps>();
const { removeEdges, updateEdgeData, screenToFlowCoordinate, viewport } = useVueFlow();

const edgeData = computed(() => (props.data as EdgeData | undefined) ?? {});
const color = computed(() => edgeData.value.color || '#86909C');
const markerId = computed(() => `arrow-${props.id}`);
const waypoints = computed(() => edgeData.value.waypoints ?? []);

const NODE_RADIUS = 10; // CircleNode 半径（节点尺寸 16px，加上视觉余量）

// Handle 位置即圆心，沿指向对端方向走 NODE_RADIUS 得到圆边缘交点
function adjustToCircleEdge(
  handleX: number,
  handleY: number,
  toX: number,
  toY: number,
): { x: number; y: number } {
  const dx = toX - handleX;
  const dy = toY - handleY;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: handleX, y: handleY };
  return {
    x: handleX + (dx / len) * NODE_RADIUS,
    y: handleY + (dy / len) * NODE_RADIUS,
  };
}

// 动态起点/终点（指向圆心方向）
const adjustedSource = computed(() => {
  const wps = waypoints.value;
  const toX = wps.length ? wps[0]!.x : props.targetX;
  const toY = wps.length ? wps[0]!.y : props.targetY;
  return adjustToCircleEdge(props.sourceX, props.sourceY, toX, toY);
});

const adjustedTarget = computed(() => {
  const wps = waypoints.value;
  const fromX = wps.length ? wps[wps.length - 1]!.x : props.sourceX;
  const fromY = wps.length ? wps[wps.length - 1]!.y : props.sourceY;
  return adjustToCircleEdge(props.targetX, props.targetY, fromX, fromY);
});

// 有 waypoints 时用折线 + 拐点圆角路径，无 waypoints 时用直线
const path = computed(() => {
  const wps = waypoints.value;
  const src = adjustedSource.value;
  const tgt = adjustedTarget.value;
  if (!wps.length) return `M${src.x},${src.y} L${tgt.x},${tgt.y}`;
  const pts = [src, ...wps, tgt];
  const r = 16; // 拐点圆角半径
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    // 计算进入和离开拐点的单位向量
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const rad = Math.min(r, inLen / 2, outLen / 2);
    // 圆角起点（沿入射方向退 rad）
    const p1x = cur.x - ((cur.x - prev.x) / inLen) * rad;
    const p1y = cur.y - ((cur.y - prev.y) / inLen) * rad;
    // 圆角终点（沿出射方向进 rad）
    const p2x = cur.x + ((next.x - cur.x) / outLen) * rad;
    const p2y = cur.y + ((next.y - cur.y) / outLen) * rad;
    d += ` L${p1x},${p1y} Q${cur.x},${cur.y} ${p2x},${p2y}`;
  }
  d += ` L${pts[pts.length - 1]!.x},${pts[pts.length - 1]!.y}`;
  return d;
});

const contextMenu = ref<{ x: number; y: number } | null>(null);

function closeMenu() {
  contextMenu.value = null;
}

let cleanupClose: (() => void) | null = null;

function onPathContextmenu(event: MouseEvent) {
  const pos = screenToFlow(event.clientX, event.clientY);
  contextMenu.value = { x: pos.x, y: pos.y };
  // 延迟注册，避免当前右键的 click 事件立即关闭菜单
  if (cleanupClose) cleanupClose();
  setTimeout(() => {
    window.addEventListener('click', closeMenu, { once: true });
    cleanupClose = () => window.removeEventListener('click', closeMenu);
  }, 0);
}

onUnmounted(() => {
  cleanupClose?.();
});

function onDeleteEdge() {
  contextMenu.value = null;
  removeEdges(props.id);
}

function removeWaypoint(index: number) {
  const wps = waypoints.value.filter((_, i) => i !== index);
  updateEdgeData(props.id, { ...edgeData.value, waypoints: wps });
}

function screenToFlow(clientX: number, clientY: number) {
  return screenToFlowCoordinate({ x: clientX, y: clientY });
}

function onPathMousedown(event: MouseEvent) {
  if (!props.selected || event.button !== 0) return;
  const pos = screenToFlow(event.clientX, event.clientY);
  // 距离源点或目标点太近时不插入拐点（箭头区域）
  const distToTarget = Math.hypot(pos.x - props.targetX, pos.y - props.targetY);
  const distToSource = Math.hypot(pos.x - props.sourceX, pos.y - props.sourceY);
  if (distToTarget < 20 || distToSource < 20) return;
  // 找到点击位置最近的线段，在该线段后插入 waypoint
  const pts = [adjustedSource.value, ...waypoints.value, adjustedTarget.value];
  let insertIndex = waypoints.value.length; // 默认追加末尾
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

// 点到线段的最短距离
function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function startDrag(event: MouseEvent, index: number, originPos?: { x: number; y: number }) {
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
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
</script>

<style>
.aix-edge-menu {
  position: absolute;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.12);
  white-space: nowrap;
  pointer-events: all;
}

.aix-edge-menu__item {
  display: block;
  width: 100%;
  padding: 7px 16px;
  border: none;
  background: transparent;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.aix-edge-menu__item:hover {
  background: #f7f8fa;
}

.aix-edge-menu__item--delete {
  color: #f53f3f;
}

.aix-edge-waypoint {
  position: absolute;
  width: 10px;
  height: 10px;
  border: 2px solid #1546f2;
  border-radius: 50%;
  background: #fff;
  cursor: move;
  pointer-events: all;
}
</style>
