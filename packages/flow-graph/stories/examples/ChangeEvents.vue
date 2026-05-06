<template>
  <div class="change-demo">
    <FlowGraph
      v-model:nodes="nodes"
      v-model:edges="edges"
      style="flex: 1"
      @node-add="onNodeAdd"
      @node-remove="onNodeRemove"
      @edge-remove="onEdgeRemove"
    />
    <div class="change-demo__log">
      <div class="change-demo__hint">
        提示：双击空白处添加节点，右键节点选「复制 / 删除」，或选中节点 / 边后按 Delete 键。
      </div>
      <div v-for="(log, i) in logs" :key="i" class="change-demo__item">
        <span :class="`change-demo__tag change-demo__tag--${log.kind}`">{{ log.kind }}</span>
        {{ log.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 演示新增的内部交互 emits：
 * - `node-add`：通过按钮 / 双击 / 复制新增节点
 * - `node-remove`：通过右键菜单或 Delete 键删除节点
 * - `edge-remove`：通过右键菜单或 Delete 键删除边（受 edgesDeletable / edge.data.deletable 约束）
 */
import { ref } from 'vue';
import { FlowGraph, type FlowEdge, type FlowNode } from '../../src';

const nodes = ref<FlowNode[]>([
  { id: 'n1', position: { x: 100, y: 120 }, data: { label: 'N1' } },
  { id: 'n2', position: { x: 300, y: 120 }, data: { label: 'N2' } },
  { id: 'n3', type: 'hexagon', position: { x: 500, y: 120 }, data: { label: 'N3' } },
]);
const edges = ref<FlowEdge[]>([
  { id: 'e1-2', source: 'n1', target: 'n2' },
  { id: 'e2-3', source: 'n2', target: 'n3' },
]);

interface LogEntry {
  kind: 'add' | 'remove-node' | 'remove-edge';
  message: string;
}
const logs = ref<LogEntry[]>([]);

function pushLog(entry: LogEntry) {
  logs.value.unshift(entry);
  if (logs.value.length > 8) logs.value.pop();
}

function onNodeAdd(node: FlowNode) {
  pushLog({ kind: 'add', message: `新增节点 id=${node.id}` });
}

function onNodeRemove(ids: string[]) {
  pushLog({ kind: 'remove-node', message: `删除节点 [${ids.join(', ')}]` });
}

function onEdgeRemove(ids: string[]) {
  pushLog({ kind: 'remove-edge', message: `删除边 [${ids.join(', ')}]` });
}
</script>

<style>
.change-demo {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.change-demo__log {
  flex-shrink: 0;
  height: 180px;
  padding: 10px 14px;
  overflow-y: auto;
  border-top: 1px solid var(--aix-colorBorder, #e5e6eb);
  background: #f7f8fa;
  font-family: monospace;
  font-size: 12px;
}

.change-demo__hint {
  margin-bottom: 6px;
  color: var(--aix-colorTextSecondary, #86909c);
  font-size: 12px;
}

.change-demo__item {
  padding: 3px 0;
  color: var(--aix-colorText, #1d2129);
}

.change-demo__tag {
  display: inline-block;
  width: 86px;
  margin-right: 8px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  text-align: center;
}

.change-demo__tag--add {
  background: #e6f7e6;
  color: #00b42a;
}

.change-demo__tag--remove-node {
  background: #fff1e8;
  color: #d4380d;
}

.change-demo__tag--remove-edge {
  background: #fff7e6;
  color: #d48806;
}
</style>
