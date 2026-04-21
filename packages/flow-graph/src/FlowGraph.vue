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
    @node-drag-stop="onNodeDragStop"
    @pane-dbl-click="onPaneDblClick"
    @node-click="({ node, event }) => emit('node-click', { node, event })"
    @node-context-menu="({ node, event }) => emit('node-right-click', { node, event })"
    @mousedown.capture="onGlobalMousedown"
  >
    <Background v-if="snapEnabled" variant="lines" :gap="gridSize" :size="1" color="#e5e6eb" />
    <Background v-else />
    <Panel v-if="searchOpen" position="top-center">
      <div class="aix-flow-search-panel">
        <div class="aix-flow-search-bar">
          <img src="./assets/icon-search.svg" width="18" height="18" alt="" />
          <input
            ref="searchInputRef"
            v-model="searchKeyword"
            class="aix-flow-search-bar__input"
            placeholder="搜索节点"
            autocomplete="off"
            @input="onSearch"
            @keydown.escape="closeSearch"
            @keydown.enter="onSearchEnter"
          />
          <button class="aix-flow-search-bar__clear" @click="closeSearch">✕</button>
        </div>
        <ul
          v-if="searchSuggestions.length"
          class="aix-flow-search-suggestions"
          :style="{ maxHeight: `${props.suggestionsMaxHeight ?? 200}px`, overflowY: 'auto' }"
        >
          <li
            v-for="node in searchSuggestions"
            :key="node.id"
            class="aix-flow-search-suggestions__item"
            @mousedown.prevent="selectSuggestion(node)"
          >
            {{ node.data?.label }}
          </li>
        </ul>
      </div>
    </Panel>
    <Panel position="bottom-center">
      <div class="aix-flow-bottom-bar">
        <button class="aix-flow-add-btn" @click="addNode">
          <img src="./assets/icon-add-node.svg" width="18" height="18" alt="" />
          添加节点
        </button>
        <FlowControls />
        <div class="aix-flow-search__wrap">
          <button class="aix-flow-search__btn" @click="toggleSearch">
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
import { computed, markRaw, nextTick, ref } from 'vue';
import ColorEdge from './components/edges/ColorEdge.vue';
import FlowControls from './components/FlowControls.vue';
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

const { updateEdge, screenToFlowCoordinate, viewport, updateNodeData, fitView } = useVueFlow();

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

/** 以 (x, y) 为中心创建新节点；开启吸附时会对齐到栅格 */
function createNode(x: number, y: number) {
  const half = nodeSize.value / 2;
  const px = snapEnabled.value ? Math.round(x / gridSize.value) * gridSize.value - half : x;
  const py = snapEnabled.value ? Math.round(y / gridSize.value) * gridSize.value - half : y;
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

/** 节点拖拽结束：若开启吸附，将节点中心对齐到栅格 */
function onNodeDragStop({ node }: { node: FlowNode }) {
  if (!snapEnabled.value) return;
  const size = node.type === 'hexagon' ? hexagonSize.value : nodeSize.value;
  const half = size / 2;
  node.position = {
    x: Math.round((node.position.x + half) / gridSize.value) * gridSize.value - half,
    y: Math.round((node.position.y + half) / gridSize.value) * gridSize.value - half,
  };
}

/** 搜索状态 */
const searchOpen = ref(false);
const searchKeyword = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);

const suggestionsVisible = ref(true);

const searchSuggestions = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  if (!kw || !suggestionsVisible.value) return [];
  return modelNodes.value.filter((n) => (n.data?.label ?? '').toLowerCase().includes(kw));
});

function toggleSearch() {
  if (searchOpen.value) {
    closeSearch();
  } else {
    searchOpen.value = true;
    nextTick(() => searchInputRef.value?.focus());
  }
}

function closeSearch() {
  searchOpen.value = false;
  searchKeyword.value = '';
  modelNodes.value.forEach((n) => {
    if (n.data?.selecting) updateNodeData(n.id, { ...n.data, selecting: false });
  });
}

function onSearch() {
  suggestionsVisible.value = true;
  const kw = searchKeyword.value.trim().toLowerCase();
  modelNodes.value.forEach((n) => {
    const matched = kw !== '' && (n.data?.label ?? '').toLowerCase().includes(kw);
    if (!!n.data?.selecting !== matched) {
      updateNodeData(n.id, { ...n.data, selecting: matched });
    }
  });
}

function onSearchEnter() {
  if (searchSuggestions.value.length === 1) selectSuggestion(searchSuggestions.value[0]!);
}

function selectSuggestion(node: FlowNode) {
  modelNodes.value.forEach((n) => {
    const selecting = n.id === node.id;
    if (!!n.data?.selecting !== selecting) {
      updateNodeData(n.id, { ...n.data, selecting });
    }
  });
  searchKeyword.value = node.data?.label ?? '';
  suggestionsVisible.value = false;
  fitView({ nodes: [node.id], duration: 300, padding: 0.5 });
}

/** 重置所有节点交互状态（active/context/selecting）并清空搜索 */
function resetAllNodeStates() {
  suggestionsVisible.value = false;
  searchKeyword.value = '';
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
  border-radius: 8px;
  color: var(--aix-colorText, #1d2129);
  font-size: 14px;
  line-height: 34px;
  cursor: pointer;
}

.aix-flow-search-suggestions__item:hover {
  background: var(--aix-controlItemBgHover, #f5f5f5);
}

.aix-flow-bottom-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.aix-flow-add-btn {
  display: flex;
  align-items: center;
  width: 102px;
  height: 42px;
  padding: 0 16px 0 12px;
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
  padding: 0 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 22px;
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
