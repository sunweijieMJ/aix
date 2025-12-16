<template>
  <button
    :class="[
      'aix-action-copy',
      { 'aix-action-copy--copied': copied },
      { 'aix-action-copy--disabled': disabled },
      className,
    ]"
    :disabled="disabled"
    :title="copied ? copiedText || '已复制' : '复制'"
    @click="handleCopy"
  >
    <slot :copied="copied">
      <!-- 复制成功图标 -->
      <template v-if="copied">
        <span
          v-if="copiedIcon && typeof copiedIcon === 'string'"
          class="aix-action-copy__icon"
        >
          {{ copiedIcon }}
        </span>
        <component
          :is="copiedIcon"
          v-else-if="copiedIcon"
          class="aix-action-copy__icon"
        />
        <Check v-else class="aix-action-copy__icon" />
      </template>
      <!-- 默认复制图标 -->
      <template v-else>
        <span
          v-if="icon && typeof icon === 'string'"
          class="aix-action-copy__icon"
        >
          {{ icon }}
        </span>
        <component :is="icon" v-else-if="icon" class="aix-action-copy__icon" />
        <Copy v-else class="aix-action-copy__icon" />
      </template>
    </slot>
  </button>
</template>

<script setup lang="ts">
/**
 * @fileoverview Actions.Copy 复制操作组件
 */
import { Check, Copy } from '@aix/icons';
import { ref } from 'vue';
import type { ActionCopyProps, ActionCopyEmits } from './types';

const props = withDefaults(defineProps<ActionCopyProps>(), {
  copiedDuration: 2000,
  disabled: false,
});

const emit = defineEmits<ActionCopyEmits>();

const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

/** 执行复制 */
async function handleCopy() {
  if (props.disabled || copied.value) return;

  try {
    // 优先使用 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(props.text);
    } else {
      // 降级方案：使用 execCommand
      const textarea = document.createElement('textarea');
      textarea.value = props.text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    // 复制成功
    copied.value = true;
    emit('copy', props.text);

    // 清除之前的定时器
    if (copiedTimer) {
      clearTimeout(copiedTimer);
    }

    // 重置状态
    copiedTimer = setTimeout(() => {
      copied.value = false;
      copiedTimer = null;
    }, props.copiedDuration);
  } catch (error) {
    console.error('[ActionCopy] 复制失败:', error);
    emit('error', error as Error);
  }
}

/** 暴露方法 */
defineExpose({
  copy: handleCopy,
});
</script>

<style scoped lang="scss">
.aix-action-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--paddingXXS, 4px) var(--paddingXS, 8px);
  transition: all 0.2s ease;
  border: none;
  border-radius: var(--borderRadiusSM, 4px);
  background: transparent;
  color: var(--colorTextSecondary, #666);
  font-size: inherit;
  cursor: pointer;

  &:hover:not(&--disabled) {
    background: var(--colorBgTextHover, rgba(0, 0, 0, 0.04));
    color: var(--colorText, #333);
  }

  &:active:not(&--disabled) {
    transform: scale(0.95);
  }

  &--copied {
    color: var(--colorSuccess, #52c41a);

    &:hover:not(.aix-action-copy--disabled) {
      background: var(--colorSuccessBg, #f6ffed);
      color: var(--colorSuccess, #52c41a);
    }
  }

  &--disabled {
    color: var(--colorTextDisabled, #ccc);
    cursor: not-allowed;
  }

  &__icon {
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
}
</style>
