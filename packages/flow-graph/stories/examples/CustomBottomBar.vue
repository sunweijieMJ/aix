<template>
  <FlowGraph v-model:nodes="nodes" v-model:edges="edges" style="width: 100%; height: 100%">
    <template #bottom-bar="{ addNode, openSearch, fitView, zoomIn, zoomOut }">
      <div class="custom-bar">
        <button class="custom-bar__btn custom-bar__btn--primary" @click="addNode">+ 圆形</button>
        <button class="custom-bar__btn" @click="addHexagon">+ 六边形</button>
        <span class="custom-bar__divider" />
        <button class="custom-bar__btn" @click="zoomOut()">－</button>
        <button class="custom-bar__btn" @click="zoomIn()">＋</button>
        <button class="custom-bar__btn" @click="fitView()">⤢</button>
        <span class="custom-bar__divider" />
        <button class="custom-bar__btn" @click="openSearch">🔍 搜索</button>
        <button class="custom-bar__btn" @click="exportJson">导出 JSON</button>
      </div>
    </template>
  </FlowGraph>
</template>

<script setup lang="ts">
/**
 * 演示 `#bottom-bar` 插槽：业务方完全替换默认底部三件套，
 * 通过 scoped slot props 拿到组件内部能力（addNode / openSearch / fitView / zoomIn / zoomOut）。
 */
import { ref } from 'vue';
import { createNodeId, FlowGraph, type FlowEdge, type FlowNode } from '../../src';

const nodes = ref<FlowNode[]>([
  { id: '1', position: { x: 100, y: 120 }, data: { label: '节点 1' } },
  { id: '2', type: 'hexagon', position: { x: 300, y: 120 }, data: { label: '节点 2' } },
]);
const edges = ref<FlowEdge[]>([{ id: 'e1-2', source: '1', target: '2' }]);

function addHexagon() {
  nodes.value.push({
    id: createNodeId('hex'),
    type: 'hexagon',
    position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 100 },
    data: { label: 'Hex', size: 40 },
  });
}

function exportJson() {
  const json = JSON.stringify({ nodes: nodes.value, edges: edges.value }, null, 2);

  console.log('[CustomBottomBar] export:\n', json);
  alert('已打印到 console');
}
</script>

<style>
.custom-bar {
  display: flex;
  align-items: center;
  height: 42px;
  padding: 0 8px;
  border-radius: 12px;
  background: var(--aix-colorBgElevated, #fff);
  box-shadow: var(--aix-shadowMD, 0 6px 36px 0 rgb(0 0 0 / 0.12));
  gap: 6px;
}

.custom-bar__btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--aix-colorBorder, #e5e6eb);
  border-radius: 8px;
  background: transparent;
  color: var(--aix-colorText, #1d2129);
  font-size: 13px;
  cursor: pointer;
}

.custom-bar__btn:hover {
  background: var(--aix-controlItemBgHover, #f5f5f5);
}

.custom-bar__btn--primary {
  border-color: var(--aix-flowGraphBrand, #1546f2);
  background: var(--aix-flowGraphBrand, #1546f2);
  color: #fff;
}

.custom-bar__btn--primary:hover {
  background: var(--aix-flowGraphBrandHover, #1240e0);
}

.custom-bar__divider {
  width: 1px;
  height: 18px;
  background: var(--aix-colorBorder, #e5e6eb);
}
</style>
