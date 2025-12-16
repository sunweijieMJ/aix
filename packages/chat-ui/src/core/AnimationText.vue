<template>
  <span class="aix-animation-text">
    <span
      v-for="(chunk, index) in chunks"
      :key="index"
      class="aix-animation-text__chunk"
      :style="getAnimationStyle(index)"
      >{{ chunk }}</span
    >
  </span>
</template>

<script setup lang="ts">
/**
 * @fileoverview AnimationText 组件
 * 提供流式文本的淡入动画效果
 * 参考 x-markdown 的 AnimationText 实现
 */
import { ref, watch, type CSSProperties } from 'vue';

interface Props {
  /** 文本内容 */
  text: string;
  /** 淡入动画持续时间（毫秒） */
  fadeDuration?: number;
  /** 动画缓动函数 */
  easing?: string;
  /** 是否启用动画 */
  enabled?: boolean;
  /** 最大 chunk 数量（超过后会合并旧 chunks，防止内存溢出） */
  maxChunks?: number;
}

const props = withDefaults(defineProps<Props>(), {
  fadeDuration: 200,
  easing: 'ease-in-out',
  enabled: true,
  maxChunks: 100,
});

/** 文本块列表 */
const chunks = ref<string[]>([]);

/** 上一次的文本 */
const prevText = ref('');

/**
 * 获取动画样式
 */
function getAnimationStyle(index: number): CSSProperties {
  if (!props.enabled) {
    return {};
  }

  return {
    animation: `aix-text-fade-in ${props.fadeDuration}ms ${props.easing} forwards`,
    animationDelay: `${index * 10}ms`,
  };
}

/**
 * 合并 chunks 以控制内存
 * 保留最后 maxChunks/2 个 chunks，将前面的合并为一个
 */
function compactChunks(): void {
  if (chunks.value.length <= props.maxChunks) {
    return;
  }

  const keepCount = Math.floor(props.maxChunks / 2);
  const mergeCount = chunks.value.length - keepCount;

  // 将前面的 chunks 合并为一个
  const mergedChunk = chunks.value.slice(0, mergeCount).join('');
  const remainingChunks = chunks.value.slice(mergeCount);

  chunks.value = [mergedChunk, ...remainingChunks];
}

/**
 * 处理文本更新
 */
watch(
  () => props.text,
  (newText) => {
    if (!props.enabled) {
      // 动画禁用时，直接显示全部文本
      chunks.value = newText ? [newText] : [];
      prevText.value = newText;
      return;
    }

    if (newText === prevText.value) {
      return;
    }

    // 检测是否是增量更新
    if (prevText.value && newText.startsWith(prevText.value)) {
      // 增量更新：只添加新增部分
      const newChunk = newText.slice(prevText.value.length);
      if (newChunk) {
        chunks.value.push(newChunk);
        // 检查是否需要合并以控制内存
        compactChunks();
      }
    } else {
      // 非增量或首次：重置为单个块
      chunks.value = newText ? [newText] : [];
    }

    prevText.value = newText;
  },
  { immediate: true },
);
</script>

<style lang="scss">
.aix-animation-text {
  &__chunk {
    opacity: 0;
  }
}
</style>
