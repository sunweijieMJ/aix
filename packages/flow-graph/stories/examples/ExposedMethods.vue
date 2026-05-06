<template>
  <div class="exposed-demo">
    <div class="exposed-demo__toolbar">
      <button class="exposed-demo__btn" @click="graphRef?.addNode()">addNode()</button>
      <button class="exposed-demo__btn" @click="graphRef?.openSearch()">openSearch()</button>
      <button class="exposed-demo__btn" @click="graphRef?.closeSearch()">closeSearch()</button>
      <button class="exposed-demo__btn" @click="graphRef?.fitView()">fitView()</button>
      <button class="exposed-demo__btn" @click="graphRef?.resetNodeStates()">
        resetNodeStates()
      </button>
      <span class="exposed-demo__hint">
        提示：先点击或框选节点 / 边，再点 resetNodeStates() 观察清空效果
      </span>
    </div>
    <FlowGraph
      ref="graphRef"
      v-model:nodes="nodes"
      v-model:edges="edges"
      style="flex: 1; width: 100%"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 演示通过 ref 调用 FlowGraph 实例方法（defineExpose 暴露的能力）。
 * 类型补充使用 `FlowGraphInstance`，业务方可以拿到完整的方法签名。
 */
import { ref } from 'vue';
import { FlowGraph, type FlowEdge, type FlowGraphInstance, type FlowNode } from '../../src';

const graphRef = ref<FlowGraphInstance | null>(null);

const nodes = ref<FlowNode[]>([
  { id: '1', position: { x: 80, y: 120 }, data: { label: '甲' } },
  { id: '2', position: { x: 280, y: 120 }, data: { label: '乙' } },
  { id: '3', type: 'hexagon', position: { x: 480, y: 120 }, data: { label: '丙' } },
]);
const edges = ref<FlowEdge[]>([
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
]);
</script>

<style>
.exposed-demo {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.exposed-demo__toolbar {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  padding: 12px;
  background: var(--aix-colorBgElevated, #fff);
}

.exposed-demo__btn {
  padding: 6px 14px;
  border: 1px solid var(--aix-colorBorder, #e5e6eb);
  border-radius: 6px;
  background: #fff;
  color: var(--aix-colorText, #1d2129);
  font-family: monospace;
  font-size: 12px;
  cursor: pointer;
}

.exposed-demo__btn:hover {
  border-color: var(--aix-flowGraphBrand, #1546f2);
  color: var(--aix-flowGraphBrand, #1546f2);
}

.exposed-demo__hint {
  margin-left: 8px;
  color: var(--aix-colorTextSecondary, #86909c);
  font-size: 12px;
}
</style>
