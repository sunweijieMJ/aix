<template>
  <div :class="['aix-content-renderer', className]" :style="style">
    <!-- 单一内容块 -->
    <template v-if="!isMultiBlock">
      <DynamicRenderer
        v-if="firstBlock"
        :block="firstBlock"
        :streaming="isStreaming"
        @action="handleAction"
        @rendered="handleRendered"
        @error="handleError"
      />
    </template>

    <!-- 多内容块 -->
    <template v-else>
      <TransitionGroup name="aix-content-fade">
        <DynamicRenderer
          v-for="block in blocks"
          :key="block.id"
          :block="block"
          :streaming="isStreaming"
          class="aix-content-renderer__block"
          @action="handleAction"
          @rendered="handleRendered"
          @error="handleError"
        />
      </TransitionGroup>
    </template>

    <!-- 加载状态 -->
    <div v-if="loading" class="aix-content-renderer__loading">
      <div class="aix-content-renderer__spinner" />
    </div>

    <!-- 错误状态（解析错误或渲染器错误） -->
    <div v-if="error || rendererError" class="aix-content-renderer__error">
      <span class="aix-content-renderer__error-icon">⚠</span>
      <span class="aix-content-renderer__error-message">{{
        (error || rendererError)?.message || '渲染失败'
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef, ref, onErrorCaptured } from 'vue';
import type { CSSProperties } from 'vue';
import { useContentRenderer } from '../composables/useContentRenderer';
import DynamicRenderer from './DynamicRenderer.vue';
import type { ContentBlock, StreamingConfig, ContentType } from './types';

interface Props {
  /** 原始内容 */
  content: string;
  /** 强制指定类型 */
  type?: ContentType;
  /** 流式渲染配置 */
  streaming?: boolean | StreamingConfig;
  /** 自定义样式类 */
  className?: string;
  /** 自定义样式 */
  style?: CSSProperties;
  /** 自定义解析器 */
  parser?: (content: string) => ContentBlock | ContentBlock[];
}

interface Emits {
  (
    e: 'action',
    payload: { blockId: string; action: string; data?: unknown },
  ): void;
  (e: 'rendered', blocks: ContentBlock[]): void;
  (e: 'error', error: Error): void;
}

const props = withDefaults(defineProps<Props>(), {
  streaming: false,
});

const emit = defineEmits<Emits>();

// 渲染器错误状态（用于错误边界）
const rendererError = ref<Error | null>(null);

// 错误边界：捕获子组件渲染错误
onErrorCaptured((err: Error, _instance, info) => {
  console.error(`[ContentRenderer] 渲染器错误 (${info}):`, err);
  rendererError.value = err;
  emit('error', err);
  // 返回 false 阻止错误继续向上传播
  return false;
});

// 使用内容渲染器 Hook
const { blocks, loading, error, isMultiBlock } = useContentRenderer(
  toRef(props, 'content'),
  {
    type: toRef(props, 'type'),
    parser: toRef(props, 'parser'),
  },
);

// 安全获取第一个块（添加空数组保护）
const firstBlock = computed(() => {
  const block = blocks.value?.[0];
  if (!block) return null;
  return block;
});

// 计算流式状态
const isStreaming = computed(() => {
  if (typeof props.streaming === 'boolean') {
    return props.streaming;
  }
  return props.streaming?.hasNextChunk ?? false;
});

// 事件处理
function handleAction(
  payload: { action: string; data?: unknown },
  blockId?: string,
) {
  const resolvedBlockId = blockId || blocks.value?.[0]?.id || 'unknown';
  emit('action', {
    blockId: resolvedBlockId,
    ...payload,
  });
}

function handleRendered() {
  emit('rendered', blocks.value);
}

function handleError(err: Error) {
  emit('error', err);
}
</script>

<style lang="scss">
.aix-content-renderer {
  position: relative;
  width: 100%;

  // &__block {
  //   margin-bottom: var(--padding, 16px);

  //   &:last-child {
  //     margin-bottom: 0;
  //   }
  // }

  &__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--padding, 16px);
  }

  &__spinner {
    width: 20px;
    height: 20px;
    animation: aix-spin 0.8s linear infinite;
    border: 2px solid var(--colorBorder, #e5e7eb);
    border-radius: 50%;
    border-top-color: var(--colorPrimary, #3b82f6);
  }

  &__error {
    display: flex;
    align-items: center;
    padding: var(--paddingSM, 12px);
    border: 1px solid var(--colorError, #ef4444);
    border-radius: var(--borderRadius, 8px);
    background: var(--colorErrorBg, #fef2f2);
    color: var(--colorErrorText, #991b1b);
    font-size: 14px;
    gap: var(--paddingXS, 8px);
  }

  &__error-icon {
    font-size: 16px;
  }
}

// 过渡动画
.aix-content-fade-enter-active,
.aix-content-fade-leave-active {
  transition: all 0.3s ease;
}

.aix-content-fade-enter-from {
  transform: translateY(-10px);
  opacity: 0;
}

.aix-content-fade-leave-to {
  transform: translateY(10px);
  opacity: 0;
}
</style>
