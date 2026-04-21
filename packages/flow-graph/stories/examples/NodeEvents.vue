<template>
  <div style="display: flex; flex-direction: column; height: 100%">
    <FlowGraph
      v-model:nodes="nodes"
      v-model:edges="edges"
      style="flex: 1"
      @node-click="onNodeClick"
      @node-right-click="onNodeRightClick"
    />
    <div class="event-log">
      <div v-for="(log, i) in logs" :key="i" class="event-log__item">{{ log }}</div>
      <div v-if="!logs.length" class="event-log__empty">左击或右击节点，事件日志显示在这里</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MouseTouchEvent } from '@vue-flow/core';
import { ref } from 'vue';
import { FlowGraph } from '../../src';
import type { FlowNode } from '../../src';

const nodes = ref<FlowNode[]>([
  { id: '1', position: { x: 100, y: 120 }, data: { label: '节点 A', color: '#1546f2' } },
  { id: '2', type: 'hexagon', position: { x: 300, y: 120 }, data: { label: '节点 B', size: 40 } },
  { id: '3', position: { x: 500, y: 120 }, data: { label: '节点 C', color: '#52c41a' } },
]);
const edges = ref([
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
]);

const logs = ref<string[]>([]);

function addLog(msg: string) {
  logs.value.unshift(msg);
  if (logs.value.length > 6) logs.value.pop();
}

function onNodeClick({ node }: { node: FlowNode; event: MouseTouchEvent }) {
  addLog(`[左击] id=${node.id}  label=${node.data?.label ?? '-'}`);
}

function onNodeRightClick({ node }: { node: FlowNode; event: MouseTouchEvent }) {
  addLog(`[右击] id=${node.id}  label=${node.data?.label ?? '-'}`);
}
</script>

<style>
.event-log {
  height: 140px;
  padding: 8px 12px;
  overflow-y: auto;
  border-top: 1px solid #e5e6eb;
  background: #f7f8fa;
  font-family: monospace;
  font-size: 12px;
}

.event-log__item {
  padding: 2px 0;
  border-bottom: 1px solid #e5e6eb;
  color: #1d2129;
}

.event-log__empty {
  color: #86909c;
}
</style>
