<template>
  <BaseNode v-bind="$props" :default-size="DEFAULT_HEXAGON_SIZE" :fallback-color="FALLBACK_COLOR">
    <template #default="{ size, nodeState, clicking, onClick }">
      <div
        class="aix-hexagon-node"
        :class="[`aix-hexagon-node--${nodeState}`, { 'aix-hexagon-node--clicking': clicking }]"
        :style="
          data?.selecting
            ? { filter: `drop-shadow(0 0 4px ${multiColors[0] || data?.color || FALLBACK_COLOR})` }
            : {}
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
          <defs>
            <clipPath id="hexagon-outer-clip">
              <path
                d="M44.7,9.89 Q48,11.8 48,15.61L48,33.39 Q48,37.2 44.7,39.11L29.3,48 Q26,49.91 22.7,48L7.3,39.11 Q4,37.2 4,33.39L4,15.61 Q4,11.8 7.3,9.89L22.7,1 Q26,-0.91 29.3,1 Z"
              />
            </clipPath>
            <clipPath id="hexagon-inner-clip">
              <path
                d="M34.8,16.88 Q37,18.15 37,20.69L37,28.31 Q37,30.85 34.8,32.12L28.2,35.93 Q26,37.2 23.8,35.93L17.2,32.12 Q15,30.85 15,28.31L15,20.69 Q15,18.15 17.2,16.88L23.8,13.07 Q26,11.8 28.2,13.07 Z"
              />
            </clipPath>
          </defs>
          <!-- 多色时外环渐变 -->
          <foreignObject
            v-if="multiColors.length > 1"
            x="0"
            y="0"
            width="52"
            height="49"
            clip-path="url(#hexagon-outer-clip)"
          >
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              :style="{ width: '52px', height: '49px', background: conicGradient }"
            />
          </foreignObject>
          <path
            d="M44.7,9.89 Q48,11.8 48,15.61L48,33.39 Q48,37.2 44.7,39.11L29.3,48 Q26,49.91 22.7,48L7.3,39.11 Q4,37.2 4,33.39L4,15.61 Q4,11.8 7.3,9.89L22.7,1 Q26,-0.91 29.3,1 Z"
            :fill="multiColors.length > 1 ? 'transparent' : fillColor"
            filter="drop-shadow(0 2px 6px rgba(103,107,122,0.12))"
          />
          <path
            d="M39.76,13.38 Q42.5,14.97 42.5,18.15L42.5,30.85 Q42.5,34.03 39.76,35.62L28.76,41.97 Q26,43.56 23.24,41.97L12.24,35.62 Q9.5,34.03 9.5,30.85L9.5,18.15 Q9.5,14.97 12.24,13.38L23.24,7.03 Q26,5.44 28.76,7.03 Z"
            :fill="
              nodeState === 'context' && multiColors.length <= 1
                ? fillColor
                : 'var(--aix-colorBgElevated, #fff)'
            "
          />
          <!-- 多色时内层渐变 -->
          <foreignObject
            v-if="multiColors.length > 1 && nodeState !== 'context'"
            x="0"
            y="0"
            width="52"
            height="49"
            clip-path="url(#hexagon-inner-clip)"
          >
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              :style="{ width: '52px', height: '49px', background: conicGradient }"
            />
          </foreignObject>
          <path
            v-if="multiColors.length <= 1 || nodeState === 'context'"
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

const props = defineProps<NodeProps<NodeData>>();

/** 六边形节点主色回退（无 data.color 时使用） */
const FALLBACK_COLOR = '#963096';

/** 节点填充色（外层/中层/内层共用） */
const fillColor = computed(
  () => props.data?.color || `var(--aix-flowGraphHexagonColor, ${FALLBACK_COLOR})`,
);

/** 多路径颜色列表，长度 > 1 时启用 conic-gradient 叠加层 */
const multiColors = computed(() => props.data?.pathColors ?? []);

/** 外环 / 内环共用的扇形渐变背景：每个颜色均匀占据 360°/n */
const conicGradient = computed(() => {
  const colors = multiColors.value;
  if (colors.length <= 1) return undefined;
  const stops = colors
    .map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`)
    .join(', ');
  return `conic-gradient(${stops})`;
});
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

.aix-hexagon-node--clicking {
  animation: aix-node-click 0.3s ease;
}
</style>
