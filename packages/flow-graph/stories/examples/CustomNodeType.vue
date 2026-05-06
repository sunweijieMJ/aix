<template>
  <FlowGraph
    v-model:nodes="nodes"
    v-model:edges="edges"
    :node-types="nodeTypes"
    style="width: 100%; height: 100%"
  />
</template>

<script setup lang="ts">
/**
 * 演示如何基于导出的 `BaseNode` + `useNodeInteraction` 实现自定义节点类型。
 * 这里实现一个「菱形」节点（diamond），通过 `nodeTypes` 注册，与内置 default/hexagon 共存。
 *
 * 关键点：
 * - 复用 `BaseNode` 拿到右键菜单 / Tooltip / Handle / 点击动画等公共能力；
 * - default slot 暴露 `{ size, nodeState, clicking, onClick }`，由业务层只画形状。
 */
import { markRaw, ref } from 'vue';
import { FlowGraph, type FlowEdge, type FlowNode, type NodeTypesMap } from '../../src';
import DiamondNode from './DiamondNode.vue';

const nodeTypes: NodeTypesMap = { diamond: markRaw(DiamondNode) };

const nodes = ref<FlowNode[]>([
  {
    id: '1',
    type: 'diamond',
    position: { x: 80, y: 120 },
    data: { label: '判定 1', color: '#1546f2' },
  },
  { id: '2', position: { x: 280, y: 120 }, data: { label: '步骤 A' } },
  {
    id: '3',
    type: 'diamond',
    position: { x: 480, y: 120 },
    data: { label: '判定 2', color: '#00b42a' },
  },
  { id: '4', type: 'hexagon', position: { x: 680, y: 120 }, data: { label: '终点' } },
]);

const edges = ref<FlowEdge[]>([
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
  { id: 'e3-4', source: '3', target: '4' },
]);
</script>
