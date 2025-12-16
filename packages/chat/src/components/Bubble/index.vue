<template>
  <div
    :class="[
      'aix-bubble',
      `aix-bubble--${placement}`,
      { 'aix-bubble--loading': loading },
      className,
      classNames?.root,
    ]"
    :style="styles?.root"
  >
    <!-- 头像 -->
    <div
      v-if="avatar !== false"
      :class="['aix-bubble__avatar', classNames?.avatar]"
      :style="styles?.avatar"
    >
      <slot name="avatar">
        <BubbleAvatar
          :role="role"
          :src="typeof avatar === 'string' ? avatar : undefined"
        />
      </slot>
    </div>

    <!-- 内容区 -->
    <div
      :class="['aix-bubble__wrapper', classNames?.wrapper]"
      :style="styles?.wrapper"
    >
      <!-- Header -->
      <div
        v-if="$slots.header"
        :class="['aix-bubble__header', classNames?.header]"
        :style="styles?.header"
      >
        <slot name="header" />
      </div>

      <!-- 消息主体 -->
      <div
        :class="['aix-bubble__body', classNames?.body]"
        :style="styles?.body"
      >
        <slot>
          <BubbleContent
            :content="content"
            :variant="variant"
            :shape="shape"
            :loading="loading"
            :typing="typing"
            :enable-markdown="enableMarkdown"
            :message-render="messageRender"
            @typing-complete="handleTypingComplete"
          />
        </slot>
      </div>

      <!-- Tool Calls -->
      <div
        v-if="toolCalls && toolCalls.length > 0"
        :class="['aix-bubble__tool-calls', classNames?.toolCalls]"
        :style="styles?.toolCalls"
      >
        <slot name="toolCalls" :tool-calls="toolCalls">
          <ToolCallList :tool-calls="toolCalls" :default-collapsed="true" />
        </slot>
      </div>

      <!-- Footer -->
      <div
        v-if="$slots.footer"
        :class="['aix-bubble__footer', classNames?.footer]"
        :style="styles?.footer"
      >
        <slot name="footer" />
      </div>

      <!-- 操作按钮 -->
      <div
        v-if="$slots.actions"
        :class="['aix-bubble__actions', classNames?.actions]"
        :style="styles?.actions"
      >
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Bubble 组件
 * @see ./types.ts - 导出类型定义
 */
import { ToolCallList } from '../ToolCall';
import BubbleAvatar from './BubbleAvatar.vue';
import BubbleContent from './BubbleContent.vue';
import type { BubbleProps, BubbleEmits } from './types';

withDefaults(defineProps<BubbleProps>(), {
  role: 'assistant',
  placement: 'start',
  avatar: true,
  variant: 'filled',
  shape: 'default',
  loading: false,
  enableMarkdown: false,
});

const emit = defineEmits<BubbleEmits>();

/** 处理打字完成事件 */
function handleTypingComplete() {
  emit('typingComplete');
}
</script>

<style scoped lang="scss">
.aix-bubble {
  display: flex;
  gap: var(--aix-bubble-gap);
  margin-bottom: var(--aix-space-lg);
  animation: bubbleSlideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* 左对齐（助手） */
  &--start {
    justify-content: flex-start;

    .aix-bubble__wrapper {
      align-items: flex-start;
    }

    .aix-bubble__body {
      transform-origin: left top;

      :deep(.aix-bubble-content--filled) {
        background: var(--aix-bubble-assistant-bg);
        border: 1px solid var(--aix-bubble-assistant-border);
        box-shadow: var(--aix-bubble-assistant-shadow);
        color: var(--aix-bubble-assistant-color);
      }

      /* corner 形状 - 左侧圆角小 */
      :deep(.aix-bubble-content--shape-corner) {
        border-radius: 4px 16px 16px 16px;
      }
    }
  }

  /* 右对齐（用户） */
  &--end {
    flex-direction: row-reverse;
    justify-content: flex-start;

    .aix-bubble__wrapper {
      align-items: flex-end;
    }

    .aix-bubble__body {
      transform-origin: right top;

      :deep(.aix-bubble-content--filled) {
        background: var(--aix-bubble-user-bg);
        border: none;
        box-shadow: var(--aix-bubble-user-shadow);
        color: var(--aix-bubble-user-color);
      }

      /* corner 形状 - 右侧圆角小 */
      :deep(.aix-bubble-content--shape-corner) {
        border-radius: 16px 4px 16px 16px;
      }
    }
  }

  &__wrapper {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 70%;
    gap: var(--paddingXXS, 4px);
  }

  &__header,
  &__footer {
    color: var(--colorTextSecondary, #999);
    font-size: var(--fontSizeXS, 12px);
  }

  &__body {
    width: 100%;
  }

  &__tool-calls {
    margin-top: var(--paddingXS, 8px);
  }

  &__actions {
    display: flex;
    margin-top: var(--aix-space-xs);
    transition: all var(--aix-transition-base);
    opacity: 0;
    transform: translateY(-4px);
    gap: var(--aix-space-xs);

    button {
      padding: 4px 10px;
      transition: all var(--aix-transition-fast);
      border: 1px solid var(--aix-color-border-secondary);
      border-radius: var(--aix-radius-sm);
      background: var(--aix-color-bg-container);
      font-size: 12px;
      cursor: pointer;
      box-shadow: var(--aix-shadow-xs);

      &:hover {
        border-color: var(--aix-color-primary);
        color: var(--aix-color-primary);
        box-shadow: var(--aix-shadow-sm);
        transform: translateY(-1px);
      }

      &:active {
        transform: translateY(0);
      }
    }
  }

  &:hover {
    .aix-bubble__actions {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 打字光标动画 - 参考 ant-design/x */
  &__typing-cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background: var(--colorPrimary, #1677ff);
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: aix-cursor-blink 0.8s linear infinite;
  }

  /* 加载动画 - 三个点错开跳动，参考 ant-design/x */
  &__loading {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;

    &-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--colorTextTertiary, #999);
      animation: aix-loading-dot 2s ease-in-out infinite;

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
}

/*  气泡滑入动画 */
@keyframes bubbleSlideUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
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

/*  响应式设计 */
@media (width <= 768px) {
  .aix-bubble {
    &__wrapper {
      max-width: 85%;
    }
  }
}
</style>
