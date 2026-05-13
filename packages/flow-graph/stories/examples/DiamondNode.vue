<template>
  <BaseNode v-bind="$props" :default-size="DEFAULT_SIZE" :fallback-color="FALLBACK_COLOR">
    <template #default="{ size, nodeState, clicking, onClick }">
      <div
        class="diamond-node"
        :class="[`diamond-node--${nodeState}`, { 'diamond-node--clicking': clicking }]"
        :style="{ width: `${size}px`, height: `${size}px` }"
        @click="onClick"
      >
        <svg :width="size" :height="size" viewBox="0 0 40 40">
          <polygon
            points="20,2 38,20 20,38 2,20"
            :fill="data?.color || FALLBACK_COLOR"
            :stroke="nodeState === 'context' ? FALLBACK_COLOR : 'transparent'"
            stroke-width="2"
          />
        </svg>
      </div>
    </template>
  </BaseNode>
</template>

<script setup lang="ts">
/**
 * 自定义菱形节点：复用 BaseNode 的交互骨架（右键菜单 / 上方 label / Handle / 状态机）。
 * 由 `BaseNode` 注入的 default slot 暴露的 `{ size, nodeState, clicking, onClick }` 驱动视觉。
 */
import type { NodeProps } from '@vue-flow/core';
import { BaseNode, type NodeData } from '../../src';

defineOptions({ name: 'AixDiamondNode', inheritAttrs: false });
defineProps<NodeProps<NodeData>>();

const DEFAULT_SIZE = 40;
const FALLBACK_COLOR = '#1546f2';
</script>

<style>
.diamond-node {
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.2s ease,
    filter 0.2s ease;
}

.diamond-node--context {
  transform: scale(0.92);
}

.diamond-node--active {
  filter: drop-shadow(0 0 6px var(--aix-flowGraphBrand, #1546f2));
}

.diamond-node--clicking {
  animation: aix-node-click 0.3s ease;
}
</style>
