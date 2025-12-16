<template>
  <div
    :class="[
      'aix-bubble-content',
      `aix-bubble-content--${variant}`,
      shape && `aix-bubble-content--shape-${shape}`,
      { 'aix-bubble-content--loading': loading },
      { 'aix-bubble-content--typing': isTypingActive },
      { 'aix-bubble-content--fade-in': typingConfig?.effect === 'fade-in' },
    ]"
  >
    <slot>
      <!-- 如果有内容，显示内容 -->
      <template v-if="displayContent">
        <!-- 使用 chat-ui 的 ContentRenderer 动态渲染 -->
        <ContentRenderer
          v-if="useSmartRenderer && typeof displayContent === 'string'"
          :content="displayContent"
          :streaming="loading"
          @action="handleRendererAction"
          @error="handleRendererError"
        />
        <!-- 多模态内容 -->
        <MultiModalContent
          v-else-if="isMultiModal"
          :content="displayContent as ContentType[]"
          :enable-markdown="enableMarkdown"
          :message-render="messageRender"
        />
        <!-- 传统渲染方式 -->
        <template v-else>
          <BubbleMarkdown
            v-if="enableMarkdown"
            :content="displayContent as string"
          />
          <div v-else class="aix-bubble-content__text">
            {{
              messageRender
                ? messageRender(String(displayContent))
                : displayContent
            }}
          </div>
        </template>
        <!-- loading 时在内容后面显示输入指示器 -->
        <span
          v-if="loading && !isTypingActive && !useSmartRenderer"
          class="aix-bubble-content__cursor"
          >▊</span
        >
      </template>
      <!-- 没有内容时显示 loading 动画 -->
      <div v-else-if="loading" class="aix-bubble-content__loading">
        <span class="aix-bubble-content__dot" />
        <span class="aix-bubble-content__dot" />
        <span class="aix-bubble-content__dot" />
      </div>
    </slot>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview BubbleContent 组件（支持多模态和打字动画）
 * @description 使用 @aix/chat-ui 的 useTyping 和 ContentRenderer 实现智能渲染
 * @see ./types.ts - 导出类型定义
 */
import type { ContentType } from '@aix/chat-sdk';
import { useTyping, ContentRenderer } from '@aix/chat-ui';
import { computed, ref, watch } from 'vue';
import BubbleMarkdown from './BubbleMarkdown.vue';
import MultiModalContent from './MultiModalContent.vue';
import type { BubbleContentProps, BubbleTypingOption } from './types';

interface ExtendedBubbleContentProps extends BubbleContentProps {
  /**
   * 是否使用 chat-ui 的智能内容渲染器
   * 启用后会自动检测内容类型（markdown/code/latex等）并使用对应渲染器
   * @default false
   */
  useSmartRenderer?: boolean;
}

interface ExtendedBubbleContentEmits {
  /** 打字动画完成 */
  (e: 'typingComplete'): void;
  /** 渲染器动作事件 */
  (
    e: 'rendererAction',
    payload: { blockId: string; action: string; data?: unknown },
  ): void;
  /** 渲染器错误事件 */
  (e: 'rendererError', error: Error): void;
}

const props = withDefaults(defineProps<ExtendedBubbleContentProps>(), {
  variant: 'filled',
  shape: 'default',
  loading: false,
  enableMarkdown: false,
  useSmartRenderer: true, // 默认启用 chat-ui 智能渲染器
});

const emit = defineEmits<ExtendedBubbleContentEmits>();

/** 判断是否为多模态内容 */
const isMultiModal = computed(() => {
  return Array.isArray(props.content);
});

/** 解析 typing 配置 */
const typingConfig = computed<BubbleTypingOption | null>(() => {
  if (!props.typing) return null;
  if (props.typing === true) {
    return {
      effect: 'typing',
      step: 1,
      interval: 30,
      keepPrefix: true,
    };
  }
  return {
    effect: props.typing.effect || 'typing',
    step: props.typing.step ?? 1,
    interval: props.typing.interval ?? 30,
    keepPrefix: props.typing.keepPrefix ?? true,
  };
});

/** 是否启用打字动画（智能渲染器模式下禁用打字动画，由渲染器处理） */
const typingEnabled = computed(() => {
  if (props.useSmartRenderer) return false;
  return !!typingConfig.value && typingConfig.value.effect === 'typing';
});

/** 字符串内容（用于打字动画） */
const stringContent = ref('');

/** 多模态内容 */
const multiModalContent = ref<ContentType[]>([]);

/** 使用 chat-ui 的 useTyping hook */
const { displayContent: typedContent, isTyping } = useTyping(stringContent, {
  enabled: typingEnabled,
  config: {
    step: 1,
    interval: 30,
    keepPrefix: true,
    effect: 'typing',
  },
  onComplete: () => {
    emit('typingComplete');
  },
});

/** 当前是否正在打字 */
const isTypingActive = computed(() => {
  // 智能渲染器模式下不显示打字状态
  if (props.useSmartRenderer) return false;
  // 多模态内容不支持打字动画
  if (isMultiModal.value) return false;
  // 淡入效果使用 CSS 动画
  if (typingConfig.value?.effect === 'fade-in') return isFadeInActive.value;
  return isTyping.value;
});

/** 淡入动画状态 */
const isFadeInActive = ref(false);

/** 最终显示的内容 */
const displayContent = computed<string | ContentType[]>(() => {
  // 多模态内容直接返回
  if (isMultiModal.value) {
    return multiModalContent.value;
  }
  // 智能渲染器模式直接返回原始内容
  if (props.useSmartRenderer) {
    return stringContent.value;
  }
  // 使用打字动画的内容
  if (typingEnabled.value) {
    return typedContent.value;
  }
  // 直接返回字符串内容
  return stringContent.value;
});

/** 监听内容变化 */
watch(
  () => props.content,
  (newContent) => {
    // 多模态内容
    if (Array.isArray(newContent)) {
      multiModalContent.value = newContent;
      stringContent.value = '';
      return;
    }

    const contentStr = newContent ? String(newContent) : '';

    // 淡入效果特殊处理
    if (
      typingConfig.value?.effect === 'fade-in' &&
      contentStr &&
      !props.useSmartRenderer
    ) {
      stringContent.value = contentStr;
      isFadeInActive.value = true;
      setTimeout(() => {
        isFadeInActive.value = false;
        emit('typingComplete');
      }, 300);
      return;
    }

    // 更新字符串内容
    stringContent.value = contentStr;
  },
  { immediate: true },
);

/** 处理渲染器动作 */
function handleRendererAction(payload: {
  blockId: string;
  action: string;
  data?: unknown;
}) {
  emit('rendererAction', payload);
}

/** 处理渲染器错误 */
function handleRendererError(error: Error) {
  emit('rendererError', error);
}
</script>

<style scoped lang="scss">
.aix-bubble-content {
  max-width: 100%;
  padding: var(--aix-bubble-padding);
  transition: all var(--aix-transition-slow);
  border-radius: var(--aix-bubble-radius);
  font-size: 15px;
  line-height: 1.6;
  overflow-wrap: break-word;
  white-space: pre-wrap;

  /* 气泡形状 */
  &--shape-default {
    border-radius: var(--aix-bubble-radius);
  }

  &--shape-round {
    border-radius: 20px;
  }

  &--shape-corner {
    border-radius: 4px 16px 16px;
  }

  /* 填充样式（通过父级 Bubble 控制） */
  &--filled {
    /* 默认样式由 Bubble.vue 中通过 .aix-bubble--start/end 控制 */
  }

  /* 描边样式 */
  &--outlined {
    transition: all var(--aix-transition-base);
    border: 1.5px solid var(--aix-color-border);
    background: transparent;

    &:hover {
      border-color: var(--aix-color-primary);
      box-shadow: var(--aix-shadow-sm);
    }
  }

  /* 无边框样式 */
  &--borderless {
    padding: var(--aix-space-sm) 0;
    border: none;
    background: transparent;
  }

  /* 阴影样式 */
  &--shadow {
    border: none;
    background: var(--colorBgContainer, #fff);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.1);
  }

  /* 淡入动画 */
  &--fade-in {
    animation: bubbleFadeIn 0.3s ease-out;
  }

  &__text {
    display: inline;
    margin: 0;
  }

  /* 打字光标动画 - 参考 ant-design/x */
  &__cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    margin-left: 2px;
    animation: aix-cursor-blink 0.8s linear infinite;
    background: var(--colorPrimary, #1677ff);
    vertical-align: text-bottom;
  }

  /* 加载动画 - 三个点错开跳动，参考 ant-design/x */
  &__loading {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
  }

  &__dot {
    width: 6px;
    height: 6px;
    animation: aix-loading-dot 2s ease-in-out infinite;
    border-radius: 50%;
    background: var(--colorTextTertiary, #999);

    &:nth-child(1) {
      animation-delay: 0s;
    }

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

/* 淡入动画关键帧 */
@keyframes bubbleFadeIn {
  from {
    transform: translateY(4px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 加载点动画 - 参考 ant-design/x，上下跳动效果 */
@keyframes aix-loading-dot {
  0%,
  40%,
  100% {
    transform: translateY(0);
  }

  10% {
    transform: translateY(4px);
  }

  20% {
    transform: translateY(0);
  }

  30% {
    transform: translateY(-4px);
  }
}

/* 光标闪烁动画 - 参考 ant-design/x */
@keyframes aix-cursor-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
</style>
