<template>
  <div class="deletable-node-demo">
    <div class="deletable-node-demo__bar">
      <span class="deletable-node-demo__hint">
        右键节点查看「删除」菜单项：A 节点 `data.deletable:
        false`，删除项整体（含图标）应为禁用灰色； 其他节点删除项保持红色。
      </span>
      <span v-if="blockedTip" class="deletable-node-demo__tip">{{ blockedTip }}</span>
    </div>
    <FlowGraph
      v-model:nodes="nodes"
      v-model:edges="edges"
      style="flex: 1"
      @node-delete-blocked="onBlocked"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 演示节点删除禁用态的视觉：
 * - A 节点 `data.deletable: false`，右键菜单的「删除」项与图标都应渲染为禁用灰色。
 * - B/C 节点保持默认（可删除），删除项为红色。
 * - 点击禁用项或按 Delete 键，会触发 `node-delete-blocked` 事件。
 */
import { ref } from 'vue';
import { FlowGraph, type FlowEdge, type FlowNode } from '../../src';

const nodes = ref<FlowNode[]>([
  { id: 'a', position: { x: 80, y: 120 }, data: { label: 'A（不可删除）', deletable: false } },
  { id: 'b', position: { x: 300, y: 120 }, data: { label: 'B' } },
  { id: 'c', position: { x: 520, y: 120 }, data: { label: 'C' } },
]);

const edges = ref<FlowEdge[]>([
  { id: 'e-a-b', source: 'a', target: 'b' },
  { id: 'e-b-c', source: 'b', target: 'c' },
]);

const blockedTip = ref('');
let blockedTimer: ReturnType<typeof setTimeout> | null = null;
function onBlocked(ids: string[]) {
  blockedTip.value = `已拦截删除：${ids.join(', ')}`;
  if (blockedTimer) clearTimeout(blockedTimer);
  blockedTimer = setTimeout(() => (blockedTip.value = ''), 2000);
}
</script>

<style>
.deletable-node-demo {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.deletable-node-demo__bar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 18px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--aix-colorBorder, #e5e6eb);
  background: #f7f8fa;
  font-size: 13px;
}

.deletable-node-demo__hint {
  color: var(--aix-colorTextSecondary, #86909c);
}

.deletable-node-demo__tip {
  margin-left: auto;
  padding: 2px 10px;
  border-radius: 4px;
  background: var(--aix-colorWarningBg, #fff7e6);
  color: var(--aix-colorWarning, #d46b08);
}
</style>
