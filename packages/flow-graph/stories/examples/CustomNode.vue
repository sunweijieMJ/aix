<template>
  <FlowGraph
    v-model:nodes="nodes"
    v-model:edges="edges"
    style="width: 100%; height: 100%"
    @connect="onConnect"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { FlowGraph } from '../../src';
import type { FlowNode, FlowEdge } from '../../src';

const nodes = ref<FlowNode[]>([
  { id: '1', position: { x: 60, y: 150 }, data: { label: '活动 1.1 认识人工智能' } },
  { id: '2', position: { x: 320, y: 60 }, data: { label: '活动 1.2 机器学习入门' } },
  { id: '3', position: { x: 320, y: 240 }, data: { label: '活动 1.3 深度学习基础' } },
  { id: '4', position: { x: 580, y: 60 }, data: { label: '活动 1.4 神经网络结构' } },
  { id: '5', position: { x: 580, y: 240 }, data: { label: '活动 1.5 强化学习原理' } },
]);

const edges = ref<FlowEdge[]>([
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e1-3', source: '1', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-5', source: '3', target: '5' },
]);

function onConnect(connection: {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}) {
  edges.value.push({
    id: `e${connection.source}-${connection.target}-${Date.now()}`,
    source: connection.source,
    target: connection.target,
  });
}
</script>
