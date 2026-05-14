<template>
  <BaseNode v-bind="$props" :default-size="DEFAULT_CIRCLE_SIZE" :fallback-color="FALLBACK_COLOR">
    <template #default="{ size, nodeState, clicking, onClick }">
      <div
        class="aix-circle-node"
        :class="[`aix-circle-node--${nodeState}`, { 'aix-circle-node--clicking': clicking }]"
        :style="{
          background: data?.activeColor || data?.color || 'var(--aix-flowGraphNodeColor, #86909c)',
          width: `${size}px`,
          height: `${size}px`,
          opacity: data?.dimmed ? 0.4 : undefined,
          filter: data?.selecting
            ? `drop-shadow(0 0 4px ${data?.activeColor || data?.color || FALLBACK_COLOR})`
            : undefined,
        }"
        @click="onClick"
      >
        <div v-if="nodeState === 'context'" class="aix-circle-node__inner" />
      </div>
    </template>
  </BaseNode>
</template>

<script setup lang="ts">
/**
 * 圆形节点：默认节点类型。
 * 所有交互（点击 active / 右键菜单 / 上方 label / Handle）均由 {@link BaseNode} 承载。
 */
import type { NodeProps } from '@vue-flow/core';
import { DEFAULT_CIRCLE_SIZE, type NodeData } from '../../types';
import BaseNode from './BaseNode.vue';

defineOptions({ name: 'AixCircleNode', inheritAttrs: false });

defineProps<NodeProps<NodeData>>();

/** 圆形节点主色回退（无 data.color 时使用） */
const FALLBACK_COLOR = '#86909c';
</script>

<style>
.aix-circle-node {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  border-radius: 50%;
}

.aix-circle-node--active {
  overflow: visible;
}

.aix-circle-node--context {
  transform: scale(0.92);
}

.aix-circle-node--clicking {
  animation: aix-node-click 0.3s ease;
}

.aix-circle-node__inner {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: var(--aix-colorBgElevated, #fff);
}
</style>
