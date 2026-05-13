<template>
  <VueFlow
    v-model:nodes="modelNodes"
    v-model:edges="modelEdges"
    :node-types="mergedNodeTypes"
    :edge-types="mergedEdgeTypes"
    :edges-updatable="true"
    :nodes-connectable="props.connectable ?? false"
    :delete-key-code="null"
    @connect="onConnect"
    @edge-update="onEdgeUpdate"
    @node-drag-start="onNodeDragStart"
    @node-drag-stop="onNodeDragStop"
    @pane-dbl-click="onPaneDblClick"
    @nodes-change="onNodesChange"
    @edges-change="onEdgesChange"
    @node-click="({ node, event }) => emit('node-click', { node, event })"
    @node-context-menu="({ node, event }) => emit('node-right-click', { node, event })"
    @mousedown.capture="onGlobalMousedown"
  >
    <Background v-if="snapEnabled" variant="lines" :gap="gridSize" :size="1" :color="gridColor" />
    <Background v-else />
    <FlowSearch
      ref="flowSearchRef"
      :nodes="modelNodes"
      :suggestions-max-height="props.suggestionsMaxHeight"
    />
    <MiniMap class="aix-flow-minimap" position="bottom-right" pannable zoomable />
    <Panel :position="bottomBarPos" :style="bottomBarStyle" class="aix-flow-bottom-panel">
      <slot
        name="bottom-bar"
        :add-node="addNode"
        :open-search="openSearch"
        :close-search="closeSearch"
        :fit-view="fitView"
        :zoom-in="zoomIn"
        :zoom-out="zoomOut"
      >
        <div class="aix-flow-bottom-bar">
          <button class="aix-flow-add-btn" @click="addNode">
            <img src="./assets/icon-add-node.svg" width="18" height="18" alt="" />
            {{ t.addNode }}
          </button>
          <FlowControls />
          <div class="aix-flow-search__wrap">
            <button class="aix-flow-search__btn" @click="openSearch">
              <img src="./assets/icon-search.svg" width="18" height="18" :alt="t.search" />
            </button>
          </div>
        </div>
      </slot>
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
 * - 双击空白处新增节点；底部面板按钮按螺旋算法在视口中心寻找不重叠位置新增节点；
 * - 提供 `#bottom-bar` 具名插槽（默认渲染 `添加节点 / Controls / 搜索` 三件套），
 *   插槽 props 暴露 `addNode / openSearch / closeSearch / fitView / zoomIn / zoomOut`。
 */
import { useLocale } from '@aix/hooks';
import { Background } from '@vue-flow/background';
import { Panel, VueFlow, useVueFlow } from '@vue-flow/core';
import type { EdgeChange, EdgeUpdateEvent, NodeChange } from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import { computed, markRaw, onMounted, onUnmounted, provide, ref } from 'vue';
import '@vue-flow/minimap/dist/style.css';
import ColorEdge from './components/edges/ColorEdge.vue';
import FlowControls from './components/FlowControls.vue';
import FlowSearch from './components/FlowSearch.vue';
import CircleNode from './components/nodes/CircleNode.vue';
import HexagonNode from './components/nodes/HexagonNode.vue';
import { locale as flowGraphLocale } from './locale';
import {
  DEFAULT_CIRCLE_SIZE,
  DEFAULT_HEXAGON_SIZE,
  FlowActiveWaypointKey,
  FlowEdgesDeletableKey,
  FlowGraphLocaleKey,
  FlowNodeLabelConfigKey,
  FlowSnapContextKey,
  type EdgeData,
  type FlowActiveWaypoint,
  type FlowConnection,
  type FlowEdge,
  type FlowGraphEmits,
  type FlowGraphProps,
  type FlowNode,
} from './types';
import { createNodeId } from './utils';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

defineOptions({ name: 'AixFlowGraph' });

// boolean 类型的 prop 在未传值时会被 Vue 的 Boolean cast 强制变成 false，
// 仅给"语义默认值为 true"的 boolean prop 显式声明 default: true，避免被 cast 误判。
const props = withDefaults(defineProps<FlowGraphProps>(), {
  snapGrid: true,
  edgesDeletable: true,
  showNodeLabel: true,
});
const emit = defineEmits<FlowGraphEmits>();

const modelNodes = defineModel<FlowNode[]>('nodes', { default: () => [] });
const modelEdges = defineModel<FlowEdge[]>('edges', { default: () => [] });

/** 栅格尺寸（px） */
const gridSize = computed(() => props.gridSize ?? 40);
/** 新建圆形节点的尺寸 */
const nodeSize = computed(() => props.defaultNodeSize ?? DEFAULT_CIRCLE_SIZE);
/** 六边形节点的尺寸（仅用于吸附时的对中修正） */
const hexagonSize = computed(() => props.defaultHexagonSize ?? DEFAULT_HEXAGON_SIZE);
/** 是否开启栅格吸附（默认 true，由 withDefaults 兜底） */
const snapEnabled = computed(() => props.snapGrid);
/** 背景网格线颜色，使用主题边框色 */
const gridColor = 'var(--aix-colorBorder, #e5e6eb)';

// 通过 InjectionKey 暴露上下文，给内部 composable / 子组件类型安全地消费
provide(FlowSnapContextKey, { snapEnabled, gridSize, nodeSize, hexagonSize });

const edgesDeletable = computed(() => props.edgesDeletable);
provide(FlowEdgesDeletableKey, edgesDeletable);

// 节点常驻 label 配置：默认开启（由 withDefaults 保证）、阈值 0.6
const nodeLabelEnabled = computed(() => props.showNodeLabel);
const nodeLabelZoomThreshold = computed(() => props.labelZoomThreshold ?? 0.6);
provide(FlowNodeLabelConfigKey, {
  enabled: nodeLabelEnabled,
  zoomThreshold: nodeLabelZoomThreshold,
});

// i18n：跟随 @aix/hooks 全局 locale（业务方通过 createLocale 注入）。
// 在这里集中解析一次并 provide，子组件（含 vue-flow 内部渲染的 BaseNode / ColorEdge）直接 inject，
// 避免每个子组件重复加载语言包。
const { t } = useLocale(flowGraphLocale);
provide(FlowGraphLocaleKey, t);

/**
 * 当前选中的拐点（单选，跨 edge），实例私有：
 * - ColorEdge 在 mousedown 时写入，使得高亮跟随选中；
 * - FlowGraph 的全局 mousedown 在点击非拐点处时清空（与节点 active 状态一致）；
 * - 全局 keydown 处理 Delete/Backspace 时优先删除该拐点。
 */
const activeWaypoint = ref<FlowActiveWaypoint | null>(null);
provide(FlowActiveWaypointKey, activeWaypoint);

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

const {
  updateEdge,
  updateEdgeData,
  findEdge,
  screenToFlowCoordinate,
  viewport,
  updateNodeData,
  getNodes,
  getEdges,
  removeEdges,
  removeNodes,
  fitView,
  zoomIn,
  zoomOut,
} = useVueFlow();

/**
 * 全局 keydown 监听规则：
 * 1. 焦点在 `<input>/<textarea>/contentEditable` 时不响应（避免吞掉用户输入框的退格）；
 * 2. 多实例隔离由"各 vue-flow store 的 `selected` 互不相通"自然保证 ——
 *    每个实例只看到并删除自己的选中元素，互不干扰。
 *
 * vue-flow 自身的 `:delete-key-code` 已被设为 `null` 关闭，删除完全由本组件接管。
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function onKeyDelete(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  if (isEditableTarget(event.target)) return;

  // 优先处理拐点删除：拐点选中时不应连带删除整条边或节点。
  // 拐点编辑（增/删/拖）与边自身的可删除性正交，不依赖 edgesDeletable / edge.data.deletable。
  // ref 是本实例私有，若 findEdge 找不到说明 edge 已被外部移除，清空 ref 后走默认删除路径即可。
  if (activeWaypoint.value) {
    const { edgeId, index } = activeWaypoint.value;
    const edge = findEdge<EdgeData>(edgeId);
    activeWaypoint.value = null;
    if (edge) {
      const wps = (edge.data?.waypoints ?? []).filter((_, i) => i !== index);
      updateEdgeData(edgeId, { ...edge.data, waypoints: wps });
      event.preventDefault();
      return;
    }
  }

  // 过滤可删除的边：单条边 deletable=false 或全局 edgesDeletable=false 都跳过
  const edgesToDelete = getEdges.value
    .filter((e) => e.selected && e.data?.deletable !== false && edgesDeletable.value)
    .map((e) => e.id);
  // 选中的节点全部删除（节点的 deletable 字段交由 vue-flow Node 类型自身控制，此处不做拦截）
  const nodesToDelete = getNodes.value
    .filter((n) => n.selected && n.deletable !== false)
    .map((n) => n.id);

  if (!edgesToDelete.length && !nodesToDelete.length) return;
  event.preventDefault();
  if (edgesToDelete.length) removeEdges(edgesToDelete);
  if (nodesToDelete.length) removeNodes(nodesToDelete);
}

onMounted(() => window.addEventListener('keydown', onKeyDelete));
onUnmounted(() => window.removeEventListener('keydown', onKeyDelete));

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
function createNode(x: number, y: number): FlowNode {
  const half = nodeSize.value / 2;
  const snap = snapEnabled.value;
  const step = gridSize.value;
  const baseX = snap ? Math.round(x / step) * step - half : x - half;
  const baseY = snap ? Math.round(y / step) * step - half : y - half;

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

  const node: FlowNode = {
    id: createNodeId(),
    position: { x: px, y: py },
    data: { size: nodeSize.value },
  };
  modelNodes.value = [...modelNodes.value, node];
  return node;
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

/**
 * 重置所有节点交互状态：
 * 1. 自定义状态 `state` / `selecting` 归零（去除 active 十字、context 缩放、搜索高亮）；
 * 2. vue-flow 内置 `selected` 状态归零（去除节点 / 边的选中边框）；
 * 3. 关闭搜索面板的高亮。
 */
function resetAllNodeStates() {
  flowSearchRef.value?.resetSelecting();
  modelNodes.value.forEach((n) => {
    const state = n.data?.state;
    if ((state && state !== 'default') || n.data?.selecting) {
      updateNodeData(n.id, { ...n.data, state: 'default', selecting: false });
    }
  });
  getNodes.value.forEach((n) => {
    if (n.selected) n.selected = false;
  });
  getEdges.value.forEach((e) => {
    if (e.selected) e.selected = false;
  });
}

/**
 * 全局 mousedown（@mousedown.capture 在 VueFlow 上，capture 阶段先于子节点 .stop 修饰符触发）：
 * - 点击非拐点时清空 activeWaypoint（与节点 active 状态保持一致的清理时机）；
 * - 点击节点/边/搜索面板之外时整体重置节点 active/context/selecting 状态。
 */
function onGlobalMousedown(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.aix-edge-waypoint')) {
    activeWaypoint.value = null;
  }
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
  const payload: FlowConnection = {
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
  };
  emit('connect', payload);
}

/** 转发 vue-flow 的节点变更：仅暴露语义事件（add/remove），变更细节由 v-model 同步 */
function onNodesChange(changes: NodeChange[]) {
  for (const change of changes) {
    if (change.type === 'add') emit('node-add', change.item as FlowNode);
  }
  const removed = changes
    .filter((c): c is Extract<NodeChange, { type: 'remove' }> => c.type === 'remove')
    .map((c) => c.id);
  if (removed.length) emit('node-remove', removed);
}

function onEdgesChange(changes: EdgeChange[]) {
  const removed = changes
    .filter((c): c is Extract<EdgeChange, { type: 'remove' }> => c.type === 'remove')
    .map((c) => c.id);
  if (removed.length) emit('edge-remove', removed);
}

/** 打开搜索面板（toggle 行为：已开则关、未开则开），供 expose / slot props 使用 */
function openSearch() {
  flowSearchRef.value?.toggle();
}

function closeSearch() {
  flowSearchRef.value?.close();
}

defineExpose({
  fitView,
  addNode,
  openSearch,
  closeSearch,
  resetNodeStates: resetAllNodeStates,
});
</script>

<style>
.aix-flow-search__wrap {
  display: flex;
  align-items: center;
  height: 42px;
  padding: 0 4px;
  border-radius: 12px;
  background: var(--aix-colorBgElevated, #fff);
  box-shadow: var(--aix-shadowMD, 0 6px 36px 0 rgb(0 0 0 / 0.12));
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
  box-shadow: var(--aix-shadowMD, 0 6px 36px 0 rgb(0 0 0 / 0.12));
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
  box-shadow: var(--aix-shadowMD, 0 6px 36px 0 rgb(0 0 0 / 0.12));
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
  height: 42px;
  padding: 0 12px;
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
  box-shadow: var(--aix-shadowMD, 0 6px 36px 0 rgb(0 0 0 / 0.12));
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
  box-shadow: var(--aix-shadowMD, 0 6px 36px 0 rgb(0 0 0 / 0.12)) !important;
}

.aix-flow-node-menu .aix-dropdown__item {
  height: 34px;
  margin: 2px 0;
  padding: 0 12px;
  border-radius: 8px;
  color: var(--aix-colorTextSecondary, #4e5969);
  font-size: 14px;
  line-height: 22px;
}

.aix-flow-node-menu .aix-dropdown__item:hover {
  color: var(--aix-colorText, #1d2129);
}

.aix-flow-node-menu__delete {
  color: var(--aix-colorError, #ff2626) !important;
}

.aix-flow-node-menu__delete:hover:not(.aix-dropdown__item--disabled) {
  background: var(--aix-colorErrorBg, #ffe8e8) !important;
}

.aix-flow-node-menu__icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-right: 4px;
}
</style>
