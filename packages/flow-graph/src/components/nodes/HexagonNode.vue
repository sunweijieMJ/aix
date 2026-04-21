<template>
  <BaseNode v-bind="$props" :default-size="DEFAULT_HEXAGON_SIZE" :fallback-color="FALLBACK_COLOR">
    <template #default="{ size, nodeState, onClick }">
      <div
        class="aix-hexagon-node"
        :class="`aix-hexagon-node--${nodeState}`"
        :style="
          data?.selecting ? { filter: `drop-shadow(0 0 4px ${data?.color || FALLBACK_COLOR})` } : {}
        "
        @click="onClick"
      >
        <svg
          :width="size"
          :height="size"
          viewBox="0 0 52 49"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M40.72,13 Q43.32,14.5 43.32,17.5L43.32,31.5 Q43.32,34.5 40.72,36L28.6,43 Q26,44.5 23.4,43L11.28,36 Q8.68,34.5 8.68,31.5L8.68,17.5 Q8.68,14.5 11.28,13L23.4,6 Q26,4.5 28.6,6 Z"
            :fill="fillColor"
            filter="drop-shadow(0 2px 6px rgba(103,107,122,0.12))"
          />
          <path
            d="M36.83,15.75 Q38.99,17 38.99,19.5L38.99,29.5 Q38.99,32 36.83,33.25L28.17,38.25 Q26,39.5 23.83,38.25L15.17,33.25 Q13.01,32 13.01,29.5L13.01,19.5 Q13.01,17 15.17,15.75L23.83,10.75 Q26,9.5 28.17,10.75 Z"
            :fill="nodeState === 'context' ? fillColor : 'var(--aix-colorBgElevated, #fff)'"
          />
          <path
            d="M32.93,18.5 Q34.66,19.5 34.66,21.5L34.66,27.5 Q34.66,29.5 32.93,30.5L27.73,33.5 Q26,34.5 24.27,33.5L19.07,30.5 Q17.34,29.5 17.34,27.5L17.34,21.5 Q17.34,19.5 19.07,18.5L24.27,15.5 Q26,14.5 27.73,15.5 Z"
            :fill="nodeState === 'context' ? 'var(--aix-colorBgElevated, #fff)' : fillColor"
          />
        </svg>
      </div>
    </template>
  </BaseNode>
</template>

<script setup lang="ts">
/**
 * 六边形节点：与 CircleNode 行为一致，仅视觉不同；`context` 状态下内外填充对调。
 * 交互壳由 {@link BaseNode} 承载。
 */
import type { NodeProps } from '@vue-flow/core';
import { computed } from 'vue';
import { DEFAULT_HEXAGON_SIZE, type NodeData } from '../../types';
import BaseNode from './BaseNode.vue';

defineOptions({ name: 'AixHexagonNode', inheritAttrs: false });
defineEmits(['updateNodeInternals']);

const props = defineProps<NodeProps<NodeData>>();

/** 六边形节点主色回退（无 data.color 时使用） */
const FALLBACK_COLOR = '#963096';

/** 节点填充色（外层/中层/内层共用） */
const fillColor = computed(
  () => props.data?.color || `var(--aix-flowGraphHexagonColor, ${FALLBACK_COLOR})`,
);
</script>

<style>
.aix-hexagon-node {
  display: inline-block;
  position: relative;
  z-index: 1;
  transition:
    transform 0.2s ease,
    filter 0.2s ease;
}

.aix-hexagon-node--context {
  transform: scale(0.92);
}
</style>
