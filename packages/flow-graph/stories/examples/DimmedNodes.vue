<template>
  <div style="position: relative; width: 100%; height: 100%">
    <div class="controls">
      <button @click="toggleNodeDim">
        {{ nodeDimActive ? '清除节点 dim' : '左击节点 dim 其他' }}
      </button>
      <button @click="toggleEditMode">
        {{ editMode ? '退出编辑路径' : '进入编辑路径（nodeEditMode）' }}
      </button>
    </div>
    <FlowGraph :nodes="computedNodes" :edges="computedEdges" style="width: 100%; height: 100%" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { FlowGraph } from '../../src';
import type { FlowEdge, FlowNode } from '../../src/types';

const RED = '#e34935';
const BLUE = '#1546f2';
const GREEN = '#00b42a';

// 模拟两条路径的节点和边
const PATH_A_NODES = new Set(['s', 'a', 'b']);
const PATH_A_EDGES = new Set(['s-a', 'a-b']);
const PATH_A_COLOR = RED;

const baseNodes: FlowNode[] = [
  {
    id: 's',
    type: 'hexagon',
    position: { x: 400, y: 260 },
    data: { label: '起点', color: RED, pathColors: [RED, BLUE] },
  },
  { id: 'a', type: 'default', position: { x: 200, y: 120 }, data: { label: '节点 A', color: RED } },
  { id: 'b', type: 'default', position: { x: 200, y: 400 }, data: { label: '节点 B', color: RED } },
  {
    id: 'c',
    type: 'default',
    position: { x: 600, y: 120 },
    data: { label: '节点 C（其他路径）', color: BLUE },
  },
  {
    id: 'd',
    type: 'default',
    position: { x: 600, y: 400 },
    data: { label: '节点 D（其他路径）', color: GREEN },
  },
];

const baseEdges: FlowEdge[] = [
  { id: 's-a', source: 's', target: 'a', data: { color: RED } },
  { id: 'a-b', source: 'a', target: 'b', data: { color: RED } },
  { id: 's-c', source: 's', target: 'c', data: { color: BLUE } },
  { id: 's-d', source: 's', target: 'd', data: { color: GREEN } },
];

// 场景1：左击节点 dim 其他节点
const nodeDimActive = ref(false);
const activeNodeId = ref('a');

function toggleNodeDim() {
  nodeDimActive.value = !nodeDimActive.value;
}

// 场景2：nodeEditMode dim 非路径节点/边，并显示 activeColor
const editMode = ref(false);

function toggleEditMode() {
  editMode.value = !editMode.value;
}

const computedNodes = computed(() =>
  baseNodes.map((n) => {
    if (editMode.value) {
      const inPath = PATH_A_NODES.has(n.id);
      return {
        ...n,
        data: { ...n.data, dimmed: !inPath, activeColor: inPath ? PATH_A_COLOR : undefined },
      };
    }
    if (nodeDimActive.value) {
      return { ...n, data: { ...n.data, dimmed: n.id !== activeNodeId.value } };
    }
    return { ...n, data: { ...n.data, dimmed: false, activeColor: undefined } };
  }),
);

const computedEdges = computed(() =>
  baseEdges.map((e) => {
    if (editMode.value) {
      return { ...e, data: { ...e.data, dimmed: !PATH_A_EDGES.has(e.id) } };
    }
    return { ...e, data: { ...e.data, dimmed: false } };
  }),
);
</script>

<style scoped>
.controls {
  display: flex;
  position: absolute;
  z-index: 10;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  gap: 8px;
}

.controls button {
  padding: 4px 14px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}

.controls button:hover {
  background: #f0f0f0;
}
</style>
