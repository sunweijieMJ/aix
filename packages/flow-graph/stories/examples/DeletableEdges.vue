<template>
  <div class="deletable-demo">
    <div class="deletable-demo__bar">
      <label class="deletable-demo__check">
        <input v-model="globalDeletable" type="checkbox" />
        全局 edgesDeletable
      </label>
      <span class="deletable-demo__legend">
        <span class="deletable-demo__sample deletable-demo__sample--ok" />
        可删除
      </span>
      <span class="deletable-demo__legend">
        <span class="deletable-demo__sample deletable-demo__sample--lock" />
        单边 deletable=false（受保护）
      </span>
      <span class="deletable-demo__hint">选中节点 / 边后按 Delete 或 Backspace 测试</span>
    </div>
    <FlowGraph
      v-model:nodes="nodes"
      v-model:edges="edges"
      :edges-deletable="globalDeletable"
      style="flex: 1"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 演示删除控制：
 * - 全局开关 `edges-deletable` 控制所有边是否允许删除（默认 true）
 * - 单条边可通过 `data.deletable: false` 单独保护（优先级高于全局）
 * - 选中节点 + 不可删除边混合时，按 Delete 键节点照样可删（Bug-1 修复后的行为）
 */
import { ref } from 'vue';
import { FlowGraph, type FlowEdge, type FlowNode } from '../../src';

const globalDeletable = ref(true);

const nodes = ref<FlowNode[]>([
  { id: 'a', position: { x: 80, y: 100 }, data: { label: 'A' } },
  { id: 'b', position: { x: 280, y: 100 }, data: { label: 'B' } },
  { id: 'c', position: { x: 480, y: 100 }, data: { label: 'C' } },
  { id: 'd', position: { x: 680, y: 100 }, data: { label: 'D' } },
]);

// e-a-b 是「不可删除」的关键链路；其他边默认可删除
const edges = ref<FlowEdge[]>([
  { id: 'e-a-b', source: 'a', target: 'b', data: { deletable: false, color: '#d4380d' } },
  { id: 'e-b-c', source: 'b', target: 'c' },
  { id: 'e-c-d', source: 'c', target: 'd' },
]);
</script>

<style>
.deletable-demo {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.deletable-demo__bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 18px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--aix-colorBorder, #e5e6eb);
  background: #f7f8fa;
  font-size: 13px;
}

.deletable-demo__check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--aix-colorText, #1d2129);
  cursor: pointer;
}

.deletable-demo__legend {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--aix-colorTextSecondary, #86909c);
}

.deletable-demo__sample {
  display: inline-block;
  width: 18px;
  height: 2px;
}

.deletable-demo__sample--ok {
  background: #86909c;
}

.deletable-demo__sample--lock {
  background: #d4380d;
}

.deletable-demo__hint {
  margin-left: auto;
  color: var(--aix-colorTextSecondary, #86909c);
}
</style>
