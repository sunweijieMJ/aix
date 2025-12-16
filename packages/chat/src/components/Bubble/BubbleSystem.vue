<template>
  <div
    :class="[
      'aix-bubble-system',
      `aix-bubble-system--${type}`,
      className,
      classNames?.root,
    ]"
    :style="styles?.root"
  >
    <!-- 图标 -->
    <span
      v-if="showIcon"
      :class="['aix-bubble-system__icon', classNames?.icon]"
      :style="styles?.icon"
    >
      <slot name="icon">
        <span v-if="icon && typeof icon === 'string'">{{ icon }}</span>
        <component :is="icon" v-else-if="icon" />
        <template v-else>
          <!-- 默认图标 -->
          <InfoOutline v-if="type === 'info'" />
          <CheckCircle v-else-if="type === 'success'" />
          <Warning v-else-if="type === 'warning'" />
          <CloseCircle v-else-if="type === 'error'" />
          <InfoOutline v-else />
        </template>
      </slot>
    </span>

    <!-- 内容 -->
    <span
      :class="['aix-bubble-system__content', classNames?.content]"
      :style="styles?.content"
    >
      <slot>{{ content }}</slot>
    </span>

    <!-- 时间 -->
    <span
      v-if="showTime && timestamp"
      :class="['aix-bubble-system__time', classNames?.time]"
      :style="styles?.time"
    >
      {{ formatTime }}
    </span>

    <!-- 关闭按钮 -->
    <button
      v-if="closable"
      :class="['aix-bubble-system__close', classNames?.close]"
      :style="styles?.close"
      type="button"
      @click="emit('close')"
    >
      <Close />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview BubbleSystem 系统消息组件
 */
import {
  InfoOutline,
  CheckCircle,
  Warning,
  CloseCircle,
  Close,
} from '@aix/icons';
import { computed } from 'vue';
import type { BubbleSystemProps, BubbleSystemEmits } from './types';

const props = withDefaults(defineProps<BubbleSystemProps>(), {
  type: 'info',
  showIcon: true,
  closable: false,
  showTime: false,
});

const emit = defineEmits<BubbleSystemEmits>();

/** 默认时间格式化 */
function defaultTimeFormat(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 格式化时间 */
const formatTime = computed(() => {
  if (!props.timestamp) return '';
  const formatter = props.timeFormat || defaultTimeFormat;
  return formatter(props.timestamp);
});
</script>

<style scoped lang="scss">
.aix-bubble-system {
  display: flex;
  align-items: center;
  gap: var(--paddingXS, 8px);
  padding: var(--paddingXS, 8px) var(--paddingSM, 12px);
  margin: var(--paddingXS, 8px) 0;
  border-radius: var(--borderRadius, 6px);
  font-size: var(--fontSizeSM, 14px);
  background: var(--colorBgLayout, #fafafa);
  color: var(--colorText, #333);

  &__icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 100%;
      height: 100%;
    }
  }

  &__content {
    flex: 1;
    line-height: 1.5;
  }

  &__time {
    flex-shrink: 0;
    font-size: var(--fontSizeXS, 12px);
    color: var(--colorTextTertiary, #999);
  }

  &__close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--colorTextTertiary, #999);
    cursor: pointer;
    border-radius: var(--borderRadiusSM, 4px);
    transition: all 0.2s ease;

    &:hover {
      background: rgba(0, 0, 0, 0.06);
      color: var(--colorText, #333);
    }

    svg {
      width: 12px;
      height: 12px;
    }
  }

  /* 类型变体 */
  &--info {
    background: var(--colorInfoBg, #e6f4ff);
    border: 1px solid var(--colorInfoBorder, #91caff);

    .aix-bubble-system__icon {
      color: var(--colorInfo, #1890ff);
    }
  }

  &--success {
    background: var(--colorSuccessBg, #f6ffed);
    border: 1px solid var(--colorSuccessBorder, #b7eb8f);

    .aix-bubble-system__icon {
      color: var(--colorSuccess, #52c41a);
    }
  }

  &--warning {
    background: var(--colorWarningBg, #fffbe6);
    border: 1px solid var(--colorWarningBorder, #ffe58f);

    .aix-bubble-system__icon {
      color: var(--colorWarning, #faad14);
    }
  }

  &--error {
    background: var(--colorErrorBg, #fff2f0);
    border: 1px solid var(--colorErrorBorder, #ffccc7);

    .aix-bubble-system__icon {
      color: var(--colorError, #ff4d4f);
    }
  }

  &--notice {
    background: var(--colorBgLayout, #fafafa);
    border: 1px solid var(--colorBorderSecondary, #f0f0f0);

    .aix-bubble-system__icon {
      color: var(--colorTextSecondary, #666);
    }
  }
}
</style>
