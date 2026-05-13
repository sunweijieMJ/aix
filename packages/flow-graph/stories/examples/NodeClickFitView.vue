<template>
  <div class="click-fit-demo">
    <div class="click-fit-demo__hint">
      提示：任意点击一个节点 —— 业务侧会立即 fitView
      把该节点居中，复制/删除菜单会跟随节点同步定位（验证回归：menu 跟随 fitView 平移）。
    </div>
    <FlowGraph
      ref="graphRef"
      v-model:nodes="nodes"
      v-model:edges="edges"
      style="flex: 1; width: 100%"
      @node-click="onNodeClick"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 回归用例：节点左击后业务方 fitView 把节点居中，菜单需跟随节点。
 *
 * 历史 bug：ContextMenu 在 manual 模式下用鼠标坐标做虚拟元素定位，
 * fitView 平移节点后菜单仍停在最初点击的屏幕位置。
 * 修复后 BaseNode 以节点 wrapper 元素为锚，floating-ui autoUpdate 跟随平移。
 */
import type { MouseTouchEvent } from '@vue-flow/core';
import { ref } from 'vue';
import { FlowGraph, type FlowEdge, type FlowGraphInstance, type FlowNode } from '../../src';

const graphRef = ref<FlowGraphInstance | null>(null);

const nodes = ref<FlowNode[]>([
  { id: '1', position: { x: 80, y: 120 }, data: { label: '甲' } },
  { id: '2', position: { x: 360, y: 80 }, data: { label: '乙' } },
  { id: '3', type: 'hexagon', position: { x: 640, y: 220 }, data: { label: '丙' } },
  { id: '4', position: { x: 240, y: 340 }, data: { label: '丁' } },
]);
const edges = ref<FlowEdge[]>([
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
  { id: 'e1-4', source: '1', target: '4' },
]);

function onNodeClick({ node }: { node: FlowNode; event: MouseTouchEvent }) {
  // 模拟业务仓库行为：点击节点后立即把该节点 fitView 到画布中央
  graphRef.value?.fitView({ nodes: [node.id], duration: 400, padding: 0.6 });
}
</script>

<style>
.click-fit-demo {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.click-fit-demo__hint {
  flex-shrink: 0;
  padding: 12px;
  background: var(--aix-colorBgElevated, #fff);
  color: var(--aix-colorTextSecondary, #4e5969);
  font-size: 12px;
  line-height: 1.6;
}
</style>
