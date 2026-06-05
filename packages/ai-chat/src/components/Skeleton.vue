<template>
  <div v-if="loading" class="aix-skeleton" aria-busy="true" aria-live="polite">
    <template v-if="rows && rows > 0">
      <div
        v-for="i in rows"
        :key="i"
        class="aix-skeleton__row"
        :class="{ 'aix-skeleton__row--short': i === rows && rows > 1 }"
      />
    </template>
    <div v-else class="aix-skeleton__block" :style="blockStyle" />
  </div>
  <slot v-else />
</template>

<script lang="ts">
export interface SkeletonProps {
  /** 是否展示骨架占位（false 时渲染默认插槽的真实内容），默认 true */
  loading?: boolean;
  /** 行模式：渲染 N 行文本占位（末行短行）；与 height/aspectRatio 互斥，优先生效 */
  rows?: number;
  /** 块模式高度（如 '120px'），默认 96px */
  height?: string;
  /** 块模式宽高比（如 '2 / 1'），设置后优先于 height */
  aspectRatio?: string;
}
</script>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<SkeletonProps>(), {
  loading: true,
  rows: undefined,
  height: undefined,
  aspectRatio: undefined,
});

const blockStyle = computed(() => {
  if (props.aspectRatio) return { aspectRatio: props.aspectRatio };
  return { height: props.height ?? '96px' };
});
</script>

<style lang="scss">
/* 通用骨架占位：shimmer 流光，供内置图片骨架与业务自定义卡片（blockRenderers /
   fence:<lang> 渲染器）在「committed 但内容未就绪」阶段统一使用 */
.aix-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--aix-paddingXS);
  width: 100%;
}

.aix-skeleton__block,
.aix-skeleton__row {
  animation: aix-skeleton-shimmer 1.4s ease infinite;
  border-radius: var(--aix-borderRadiusSM);
  background: linear-gradient(
    90deg,
    var(--aix-colorFillSecondary) 25%,
    var(--aix-colorFillTertiary) 37%,
    var(--aix-colorFillSecondary) 63%
  );
  background-size: 400% 100%;
}

.aix-skeleton__row {
  height: 1em;
}

.aix-skeleton__row--short {
  width: 60%;
}

@keyframes aix-skeleton-shimmer {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}
</style>
