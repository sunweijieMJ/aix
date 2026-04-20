<template>
  <VueFlow
    v-model:nodes="modelNodes"
    v-model:edges="modelEdges"
    :node-types="customNodeTypes"
    :edge-types="customEdgeTypes"
    :edges-updatable="true"
    :nodes-connectable="props.connectable ?? true"
    @connect="onConnect"
    @edge-update="onEdgeUpdate"
    @node-drag-stop="onNodeDragStop"
    @pane-dbl-click="onPaneDblClick"
    @pane-click="onPaneClick"
    @node-click="({ node, event }) => emit('node-click', { node, event })"
  >
    <Background v-if="snapEnabled" variant="lines" :gap="GRID_SIZE" :size="1" :color="'#e5e6eb'" />
    <Background v-else />
    <FlowControls />
    <Panel position="bottom-center">
      <button class="aix-flow-add-btn" @click="addNode">+ 添加节点</button>
    </Panel>
  </VueFlow>
</template>

<script setup lang="ts">
import { Background } from '@vue-flow/background';
import { Panel, VueFlow, useVueFlow } from '@vue-flow/core';
import type { Connection, EdgeUpdateEvent, MouseTouchEvent } from '@vue-flow/core';
import { computed, markRaw } from 'vue';
import ColorEdge from './components/edges/ColorEdge.vue';
import FlowControls from './components/FlowControls.vue';
import CircleNode from './components/nodes/CircleNode.vue';
import HexagonNode from './components/nodes/HexagonNode.vue';
import type { FlowNode, FlowEdge, FlowGraphProps } from './types';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

const GRID_SIZE = 20;
const NODE_HALF = 8;

defineOptions({ name: 'AixFlowGraph' });

const props = defineProps<FlowGraphProps>();

const snapEnabled = computed(() => props.snapGrid !== false);
const emit = defineEmits<{
  'node-click': [payload: { node: FlowNode; event: MouseTouchEvent }];
  connect: [connection: Connection];
  'add-node-blocked': [];
}>();

const modelNodes = defineModel<FlowNode[]>('nodes', { default: () => [] });
const modelEdges = defineModel<FlowEdge[]>('edges', { default: () => [] });

const { updateEdge, screenToFlowCoordinate, viewport, updateNodeData } = useVueFlow();

const customNodeTypes = { default: markRaw(CircleNode), hexagon: markRaw(HexagonNode) };
const customEdgeTypes = { default: markRaw(ColorEdge) };

function createNode(x: number, y: number) {
  const px = snapEnabled.value ? Math.round(x / GRID_SIZE) * GRID_SIZE - NODE_HALF : x;
  const py = snapEnabled.value ? Math.round(y / GRID_SIZE) * GRID_SIZE - NODE_HALF : y;
  modelNodes.value = [
    ...modelNodes.value,
    {
      id: `node-${Date.now()}`,
      position: { x: px, y: py },
      data: { color: '#86909C', _new: true },
    },
  ];
}

function addNode() {
  // 如果有刚创建还未命名的节点，不允许继续添加
  if (modelNodes.value.some((n) => n.data?._new)) {
    emit('add-node-blocked');
    return;
  }
  const { x, y, zoom } = viewport.value;
  const pane = document.querySelector('.vue-flow__pane') as HTMLElement | null;
  const rect = pane?.getBoundingClientRect();
  if (!rect) {
    createNode(200, 150);
    return;
  }
  // 视口中心的画布坐标
  const cx = (rect.width / 2 - x) / zoom;
  const cy = (rect.height / 2 - y) / zoom;
  // 找不重叠的位置
  const MIN_DIST = 60;
  let px = cx,
    py = cy;
  const existing = modelNodes.value;
  for (let r = 0; r < 10; r++) {
    const angle = r * 2.4;
    px = cx + r * MIN_DIST * Math.cos(angle);
    py = cy + r * MIN_DIST * Math.sin(angle);
    if (existing.every((n) => Math.hypot(n.position.x - px, n.position.y - py) >= MIN_DIST)) break;
  }
  createNode(px, py);
}

function onNodeDragStop({ node }: { node: FlowNode }) {
  if (!snapEnabled.value) return;
  // 六边形 24×23，中心偏移 (12, 11.5)；圆形 16×16，中心偏移 (8, 8)
  const halfX = node.type === 'hexagon' ? 12 : NODE_HALF;
  const halfY = node.type === 'hexagon' ? 11.5 : NODE_HALF;
  node.position = {
    x: Math.round((node.position.x + halfX) / GRID_SIZE) * GRID_SIZE - halfX,
    y: Math.round((node.position.y + halfY) / GRID_SIZE) * GRID_SIZE - halfY,
  };
}

function onPaneClick() {
  modelNodes.value.forEach((n) => {
    if (n.data?.state && n.data.state !== 'default') {
      updateNodeData(n.id, { ...n.data, state: 'default' });
    }
  });
}

function onPaneDblClick(event: MouseEvent) {
  const pos = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  createNode(pos.x, pos.y);
}

function onEdgeUpdate({ edge, connection }: EdgeUpdateEvent) {
  updateEdge(edge, connection);
}

function onConnect(connection: Connection) {
  emit('connect', connection);
}
</script>

<style>
.aix-flow-add-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 10px;
  background: #1546f2;
  box-shadow: 0 10px 24px rgb(21 70 242 / 0.24);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.aix-flow-add-btn:hover {
  background: #1240e0;
}
</style>
