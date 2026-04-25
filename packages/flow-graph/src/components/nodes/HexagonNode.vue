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
            d="M44.7,9.89 Q48,11.8 48,15.61L48,33.39 Q48,37.2 44.7,39.11L29.3,48 Q26,49.91 22.7,48L7.3,39.11 Q4,37.2 4,33.39L4,15.61 Q4,11.8 7.3,9.89L22.7,1 Q26,-0.91 29.3,1 Z"
            :fill="fillColor"
            filter="drop-shadow(0 2px 6px rgba(103,107,122,0.12))"
          />
          <path
            d="M39.76,13.38 Q42.5,14.97 42.5,18.15L42.5,30.85 Q42.5,34.03 39.76,35.62L28.76,41.97 Q26,43.56 23.24,41.97L12.24,35.62 Q9.5,34.03 9.5,30.85L9.5,18.15 Q9.5,14.97 12.24,13.38L23.24,7.03 Q26,5.44 28.76,7.03 Z"
            :fill="nodeState === 'context' ? fillColor : 'var(--aix-colorBgElevated, #fff)'"
          />
          <path
            d="M34.8,16.88 Q37,18.15 37,20.69L37,28.31 Q37,30.85 34.8,32.12L28.2,35.93 Q26,37.2 23.8,35.93L17.2,32.12 Q15,30.85 15,28.31L15,20.69 Q15,18.15 17.2,16.88L23.8,13.07 Q26,11.8 28.2,13.07 Z"
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
