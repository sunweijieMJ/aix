<template>
  <FlowGraph
    v-model:nodes="nodes"
    v-model:edges="edges"
    :snap-grid="true"
    style="width: 100%; height: 100%"
    @connect="onConnect"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { FlowGraph } from '../../src';
import type { FlowNode, FlowEdge } from '../../src';

const nodes = ref<FlowNode[]>([
  { id: '1', type: 'hexagon', position: { x: 68, y: 148 }, data: { color: '#963096' } },
  { id: '2', position: { x: 272, y: 72 }, data: { label: '节点 2' } },
  { id: '3', position: { x: 272, y: 212 }, data: { label: '节点 3' } },
  { id: '4', position: { x: 472, y: 152 }, data: { label: '节点 4' } },
]);

const edges = ref<FlowEdge[]>([
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e1-3', source: '1', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-4', source: '3', target: '4' },
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
