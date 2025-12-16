<template>
  <div
    :class="[
      'aix-bubble-divider',
      `aix-bubble-divider--${type}`,
      `aix-bubble-divider--${orientation}`,
      className,
      classNames?.root,
    ]"
    :style="styles?.root"
  >
    <span
      v-if="type === 'line' || type === 'dashed'"
      :class="['aix-bubble-divider__line', classNames?.line]"
      :style="styles?.line"
    />
    <template v-else>
      <span
        :class="['aix-bubble-divider__line', classNames?.line]"
        :style="styles?.line"
      />
      <span
        :class="['aix-bubble-divider__text', classNames?.text]"
        :style="styles?.text"
      >
        <slot>{{ displayText }}</slot>
      </span>
      <span
        :class="['aix-bubble-divider__line', classNames?.line]"
        :style="styles?.line"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview BubbleDivider 分隔线组件
 */
import { computed } from 'vue';
import type { BubbleDividerProps } from './types';

const props = withDefaults(defineProps<BubbleDividerProps>(), {
  type: 'line',
  orientation: 'center',
});

/** 默认时间格式化 */
function defaultTimeFormat(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) {
    return `今天 ${timeStr}`;
  }
  if (isYesterday) {
    return `昨天 ${timeStr}`;
  }
  return date.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 显示文本 */
const displayText = computed(() => {
  if (props.type === 'time' && props.timestamp) {
    const formatter = props.timeFormat || defaultTimeFormat;
    return formatter(props.timestamp);
  }
  return props.text || '';
});
</script>

<style scoped lang="scss">
.aix-bubble-divider {
  display: flex;
  align-items: center;
  gap: var(--paddingXS, 8px);
  padding: var(--paddingSM, 12px) 0;
  width: 100%;

  &__line {
    flex: 1;
    height: 1px;
    background: var(--colorBorderSecondary, #f0f0f0);
  }

  &__text {
    flex-shrink: 0;
    font-size: var(--fontSizeXS, 12px);
    color: var(--colorTextTertiary, #999);
    padding: 0 var(--paddingXS, 8px);
    background: var(--colorBgContainer, #fff);
  }

  /* 类型变体 */
  &--line {
    .aix-bubble-divider__line {
      flex: 1;
    }
  }

  &--dashed {
    .aix-bubble-divider__line {
      background: none;
      border-top: 1px dashed var(--colorBorderSecondary, #f0f0f0);
    }
  }

  &--text,
  &--time {
    .aix-bubble-divider__line {
      flex: 1;
      min-width: 20px;
    }
  }

  /* 方向变体 */
  &--left {
    .aix-bubble-divider__line:first-child {
      flex: 0;
      min-width: 0;
    }
    .aix-bubble-divider__text {
      padding-left: 0;
    }
  }

  &--right {
    .aix-bubble-divider__line:last-child {
      flex: 0;
      min-width: 0;
    }
    .aix-bubble-divider__text {
      padding-right: 0;
    }
  }
}
</style>
