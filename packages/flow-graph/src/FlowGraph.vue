<template>
  <VueFlow
    v-model:nodes="modelNodes"
    v-model:edges="modelEdges"
    :node-types="mergedNodeTypes"
    :edge-types="mergedEdgeTypes"
    :edges-updatable="true"
    :nodes-connectable="props.connectable ?? false"
    @connect="onConnect"
    @edge-update="onEdgeUpdate"
    @node-drag-start="onNodeDragStart"
    @node-drag-stop="onNodeDragStop"
    @pane-dbl-click="onPaneDblClick"
    @node-click="({ node, event }) => emit('node-click', { node, event })"
    @node-context-menu="({ node, event }) => emit('node-right-click', { node, event })"
    @mousedown.capture="onGlobalMousedown"
  >
    <Background v-if="snapEnabled" variant="lines" :gap="gridSize" :size="1" color="#e5e6eb" />
    <Background v-else />
    <FlowSearch
      ref="flowSearchRef"
      :nodes="modelNodes"
      :suggestions-max-height="props.suggestionsMaxHeight"
    />
    <MiniMap class="aix-flow-minimap" position="bottom-right" pannable zoomable />
    <Panel :position="bottomBarPos" :style="bottomBarStyle" class="aix-flow-bottom-panel">
      <div class="aix-flow-bottom-bar">
        <button class="aix-flow-add-btn" @click="addNode">
          <img src="./assets/icon-add-node.svg" width="18" height="18" alt="" />
          添加节点
        </button>
        <FlowControls />
        <div class="aix-flow-search__wrap">
          <button class="aix-flow-search__btn" @click="flowSearchRef?.toggle()">
            <img src="./assets/icon-search.svg" width="18" height="18" alt="搜索" />
          </button>
        </div>
      </div>
    </Panel>
  </VueFlow>
</template>

<script setup lang="ts">
/**
 * AixFlowGraph：基于 `@vue-flow/core` 的流程图容器组件。
 *
 * 特性：
 * - 支持 v-model 双向绑定节点与边；
 * - 内置圆形 / 六边形节点与彩色折线边，可通过 `nodeTypes`/`edgeTypes` 扩展；
 * - 支持网格吸附（`snapGrid` + `gridSize`）与画布控制条；
 * - 双击空白处新增节点；底部面板按钮按螺旋算法在视口中心寻找不重叠位置新增节点。
 */
import { Background } from '@vue-flow/background';
import { Panel, VueFlow, useVueFlow } from '@vue-flow/core';
import type { EdgeUpdateEvent, MouseTouchEvent } from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import { computed, markRaw, onMounted, onUnmounted, provide, ref } from 'vue';
import '@vue-flow/minimap/dist/style.css';
import ColorEdge from './components/edges/ColorEdge.vue';
import FlowControls from './components/FlowControls.vue';
import FlowSearch from './components/FlowSearch.vue';
import CircleNode from './components/nodes/CircleNode.vue';
import HexagonNode from './components/nodes/HexagonNode.vue';
import { createNodeId } from './composables/useNodeInteraction';
import {
  DEFAULT_CIRCLE_SIZE,
  DEFAULT_HEXAGON_SIZE,
  type FlowNode,
  type FlowEdge,
  type FlowGraphProps,
  type FlowConnection,
} from './types';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

defineOptions({ name: 'AixFlowGraph' });

const props = defineProps<FlowGraphProps>();
const emit = defineEmits<{
  /** 节点被点击 */
  'node-click': [payload: { node: FlowNode; event: MouseTouchEvent }];
  'node-right-click': [payload: { node: FlowNode; event: MouseTouchEvent }];
  connect: [connection: FlowConnection];
}>();

const modelNodes = defineModel<FlowNode[]>('nodes', { default: () => [] });
const modelEdges = defineModel<FlowEdge[]>('edges', { default: () => [] });

/** 栅格尺寸（px） */
const gridSize = computed(() => props.gridSize ?? 40);
/** 新建圆形节点的尺寸 */
const nodeSize = computed(() => props.defaultNodeSize ?? DEFAULT_CIRCLE_SIZE);
/** 六边形节点的尺寸（仅用于吸附时的对中修正） */
const hexagonSize = computed(() => props.defaultHexagonSize ?? DEFAULT_HEXAGON_SIZE);
/** 是否开启栅格吸附 */
const snapEnabled = computed(() => props.snapGrid !== false);

provide('flowSnap', { snapEnabled, gridSize, nodeSize, hexagonSize });

const edgesDeletable = computed(() => props.edgesDeletable !== false);

const bottomBarPos = computed(() => {
  const p = props.bottomBarPosition;
  if (!p) return 'bottom-center';
  return typeof p === 'string' ? p : (p.position ?? 'bottom-center');
});

const bottomBarStyle = computed(() => {
  const p = props.bottomBarPosition;
  if (!p || typeof p === 'string') return {};
  const { x = 0, y = 0 } = p.offset ?? {};
  return { transform: `translateX(calc(-50% + ${x}px)) translateY(${y}px)` };
});
provide('flowEdgesDeletable', edgesDeletable);

const {
  updateEdge,
  screenToFlowCoordinate,
  viewport,
  updateNodeData,
  getEdges,
  removeEdges,
  fitView,
} = useVueFlow();

defineExpose({ fitView });

function onKeyDelete(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  const nonDeletableSelected = getEdges.value.some(
    (e) => e.selected && (e.data?.deletable === false || !edgesDeletable.value),
  );
  if (!nonDeletableSelected) return;
  event.stopPropagation();
  event.preventDefault();
  const toDelete = getEdges.value
    .filter((e) => e.selected && e.data?.deletable !== false && edgesDeletable.value)
    .map((e) => e.id);
  if (toDelete.length) removeEdges(toDelete);
}

onMounted(() => document.addEventListener('keydown', onKeyDelete, true));
onUnmounted(() => document.removeEventListener('keydown', onKeyDelete, true));

/** 内置节点类型（markRaw 避免 Vue 代理开销） */
const builtInNodeTypes = {
  default: markRaw(CircleNode),
  hexagon: markRaw(HexagonNode),
} as const;
/** 内置边类型 */
const builtInEdgeTypes = {
  default: markRaw(ColorEdge),
} as const;

/** 合并内置 + 用户自定义节点类型，同名 key 以用户为准 */
const mergedNodeTypes = computed(() => ({ ...builtInNodeTypes, ...(props.nodeTypes ?? {}) }));
/** 合并内置 + 用户自定义边类型，同名 key 以用户为准 */
const mergedEdgeTypes = computed(() => ({ ...builtInEdgeTypes, ...(props.edgeTypes ?? {}) }));

/** 以 (x, y) 为中心创建新节点；开启吸附时会对齐到栅格并避开已有节点 */
function createNode(x: number, y: number) {
  const half = nodeSize.value / 2;
  const snap = snapEnabled.value;
  const step = gridSize.value;
  const baseX = snap ? Math.round(x / step) * step - half : x;
  const baseY = snap ? Math.round(y / step) * step - half : y;

  let px = baseX;
  let py = baseY;
  if (snap) {
    const existing = new Set(modelNodes.value.map((n) => `${n.position.x},${n.position.y}`));
    for (let r = 0; existing.has(`${px},${py}`); r++) {
      const angle = r * 2.4;
      px = Math.round((baseX + half + (r + 1) * step * Math.cos(angle)) / step) * step - half;
      py = Math.round((baseY + half + (r + 1) * step * Math.sin(angle)) / step) * step - half;
    }
  }

  modelNodes.value = [
    ...modelNodes.value,
    {
      id: createNodeId(),
      position: { x: px, y: py },
      data: { size: nodeSize.value },
    },
  ];
}

/** 在视口中心附近螺旋搜索一个不与现有节点重叠的位置并新建节点 */
function addNode() {
  const { x, y, zoom } = viewport.value;
  const pane = document.querySelector('.vue-flow__pane') as HTMLElement | null;
  const rect = pane?.getBoundingClientRect();
  if (!rect) {
    createNode(200, 150);
    return;
  }
  const cx = (rect.width / 2 - x) / zoom;
  const cy = (rect.height / 2 - y) / zoom;
  const MIN_DIST = 60;
  let px = cx;
  let py = cy;
  const existing = modelNodes.value;
  for (let r = 0; r < 10; r++) {
    const angle = r * 2.4;
    px = cx + r * MIN_DIST * Math.cos(angle);
    py = cy + r * MIN_DIST * Math.sin(angle);
    if (existing.every((n) => Math.hypot(n.position.x - px, n.position.y - py) >= MIN_DIST)) break;
  }
  createNode(px, py);
}

/** 记录拖拽开始时的节点位置，用于重叠时回退 */
const dragStartPositions = new Map<string, { x: number; y: number }>();

function onNodeDragStart({ node }: { node: FlowNode }) {
  dragStartPositions.set(node.id, { ...node.position });
}

/** 节点拖拽结束：若开启吸附，将节点中心对齐到栅格；若目标位置与其他节点重叠则回退原位 */
function onNodeDragStop({ node }: { node: FlowNode }) {
  if (!snapEnabled.value) return;
  const size = node.type === 'hexagon' ? hexagonSize.value : nodeSize.value;
  const half = size / 2;
  const step = gridSize.value;
  const snappedCx = Math.round((node.position.x + half) / step) * step;
  const snappedCy = Math.round((node.position.y + half) / step) * step;
  const snappedX = snappedCx - half;
  const snappedY = snappedCy - half;
  const occupied = modelNodes.value.some((n) => {
    if (n.id === node.id) return false;
    const nSize = n.type === 'hexagon' ? hexagonSize.value : nodeSize.value;
    const nHalf = nSize / 2;
    return n.position.x + nHalf === snappedCx && n.position.y + nHalf === snappedCy;
  });
  if (occupied) {
    const origin = dragStartPositions.get(node.id);
    if (origin) node.position = { ...origin };
  } else {
    node.position = { x: snappedX, y: snappedY };
  }
  dragStartPositions.delete(node.id);
}

const flowSearchRef = ref<{
  toggle: () => void;
  close: () => void;
  resetSelecting: () => void;
} | null>(null);

/** 重置所有节点交互状态（active/context/selecting）并清空搜索 */
function resetAllNodeStates() {
  flowSearchRef.value?.resetSelecting();
  modelNodes.value.forEach((n) => {
    const state = n.data?.state;
    if ((state && state !== 'default') || n.data?.selecting) {
      updateNodeData(n.id, { ...n.data, state: 'default', selecting: false });
    }
  });
}

/** 全局 mousedown：点击节点/边/搜索面板之外时重置所有节点状态 */
function onGlobalMousedown(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (
    !target.closest('.vue-flow__node') &&
    !target.closest('.vue-flow__edge') &&
    !target.closest('.aix-flow-search-panel')
  ) {
    resetAllNodeStates();
  }
}

/** 双击空白：在点击坐标处新建节点 */
function onPaneDblClick(event: MouseEvent) {
  const pos = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  createNode(pos.x, pos.y);
}

/** 边的端点被拖拽到新位置：更新连接 */
function onEdgeUpdate({ edge, connection }: EdgeUpdateEvent) {
  updateEdge(edge, connection);
}

/** VueFlow connect 事件透传；将可选 handle 规范化为 null */
function onConnect(connection: {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}) {
  emit('connect', {
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
  });
}
</script>

<style>
.aix-flow-search__wrap {
  display: flex;
  align-items: center;
  height: 42px;
  padding: 0 4px;
  border-radius: 12px;
  background: var(--aix-colorBgElevated, #fff);
  box-shadow: 0 6px 36px rgb(0 0 0 / 0.12);
}

.aix-flow-search__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.aix-flow-search__btn:hover {
  border-radius: 8px;
  background: var(--aix-controlItemBgHover, #f5f5f5);
}

.aix-flow-search-panel {
  width: 320px;
}

.aix-flow-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--aix-colorBgElevated, #fff);
  box-shadow: 0 6px 36px rgb(0 0 0 / 0.12);
}

.aix-flow-search-bar__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--aix-colorText, #1d2129);
  font-size: 14px;
}

.aix-flow-search-bar__input::placeholder {
  color: var(--aix-colorTextPlaceholder, #86909c);
}

.aix-flow-search-bar__clear {
  padding: 0 2px;
  border: none;
  background: transparent;
  color: var(--aix-colorTextSecondary, #86909c);
  font-size: 12px;
  cursor: pointer;
}

.aix-flow-search-suggestions {
  margin: 4px 0 0;
  padding: 4px;
  border-radius: 12px;
  background: var(--aix-colorBgElevated, #fff);
  box-shadow: 0 6px 36px rgb(0 0 0 / 0.12);
  list-style: none;
}

.aix-flow-search-suggestions__item {
  height: 34px;
  padding: 0 12px;
  overflow: hidden;
  border-radius: 8px;
  color: var(--aix-colorText, #1d2129);
  font-size: 14px;
  line-height: 34px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.aix-flow-search-suggestions__item:hover {
  background: var(--aix-controlItemBgHover, #f5f5f5);
}

.aix-flow-bottom-panel {
  transition: transform 0.3s ease;
}

.aix-flow-bottom-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.aix-flow-add-btn {
  display: flex;
  align-items: center;
  width: 102px;
  height: 42px;
  padding: 10px 12px;
  border: none;
  border-radius: 12px;
  background: var(--aix-flowGraphBrand, #1546f2);
  box-shadow: none;
  color: var(--aix-colorTextLight, #fff);
  font-size: var(--aix-fontSize, 14px);
  white-space: nowrap;
  cursor: pointer;
  gap: 4px;
}

.aix-flow-add-btn:hover {
  background: var(--aix-flowGraphBrandHover, #1240e0);
}

.aix-flow-minimap.vue-flow__minimap {
  overflow: hidden;
  border: none;
  border-radius: 12px;
  box-shadow: 0 6px 36px rgb(0 0 0 / 0.12);
}

.aix-flow-minimap.vue-flow__minimap svg {
  display: block;
}

/* 节点右键菜单样式 */
.aix-flow-node-menu {
  width: 94px;
  min-width: 94px !important;
  padding: 4px !important;
  border-radius: 12px !important;
  box-shadow: 0 6px 36px rgb(0 0 0 / 0.12) !important;
}

.aix-flow-node-menu .aix-dropdown__item {
  height: 34px;
  margin: 2px 0;
  padding: 0 12px;
  border-radius: 8px;
  color: #4e5969;
  font-size: 14px;
  line-height: 22px;
}

.aix-flow-node-menu .aix-dropdown__item:hover {
  color: #1d2129;
}

.aix-flow-node-menu__delete {
  background: #f5f5f5;
  color: #ff2626 !important;
}

.aix-flow-node-menu__delete:hover:not(.aix-dropdown__item--disabled) {
  background: #ffe8e8 !important;
}

.aix-flow-node-menu__icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-right: 4px;
}
</style>
