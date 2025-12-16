<template>
  <ContentRenderer
    class="aix-bubble-markdown"
    :content="content"
    type="markdown"
    :streaming="streamingConfig"
    @rendered="handleRendered"
    @error="handleError"
  />
</template>

<script setup lang="ts">
/**
 * @fileoverview BubbleMarkdown 组件 - Markdown 渲染
 * 使用 @aix/chat-ui 的 ContentRenderer 实现完整的流式渲染支持
 */
import type { StreamingConfig } from '@aix/chat-ui';
import { ContentRenderer } from '@aix/chat-ui';
import { computed } from 'vue';

interface BubbleMarkdownProps {
  /** Markdown 内容 */
  content: string;
  /** 是否正在流式输出 */
  streaming?: boolean;
  /** 启用打字动画 */
  enableAnimation?: boolean;
}

interface BubbleMarkdownEmits {
  /** 渲染完成 */
  (e: 'rendered'): void;
  /** 渲染错误 */
  (e: 'error', error: Error): void;
}

const props = withDefaults(defineProps<BubbleMarkdownProps>(), {
  streaming: false,
  enableAnimation: true,
});

const emit = defineEmits<BubbleMarkdownEmits>();

/**
 * 流式渲染配置
 */
const streamingConfig = computed<StreamingConfig | boolean>(() => {
  if (!props.streaming) {
    return false;
  }

  return {
    hasNextChunk: true,
    enableAnimation: props.enableAnimation,
    animationConfig: {
      fadeDuration: 200,
      easing: 'ease-in-out',
    },
  };
});

function handleRendered() {
  emit('rendered');
}

function handleError(error: Error) {
  emit('error', error);
}
</script>

<style lang="scss">
/* 覆盖 chat-ui 的一些样式以适配 chat 主题 */
.aix-bubble-markdown {
  /* 使用 chat 包的 CSS 变量 */
  --aix-font-size: var(--fontSize, 14px);
  --aix-line-height: var(--lineHeight, 1.6);
  --aix-text-primary: var(--colorText, #1f2937);
  --aix-text-heading: var(--colorTextHeading, #111827);
  --aix-text-secondary: var(--colorTextSecondary, #6b7280);
  --aix-link: var(--colorLink, #3b82f6);
  --aix-code-bg: var(--colorFillSecondary, rgba(0, 0, 0, 0.06));
  --aix-border: var(--colorBorder, #e5e7eb);
  --aix-bg-subtle: var(--colorFillQuaternary, #f9fafb);
}
</style>
