<template>
  <button
    :class="[
      'aix-button',
      `aix-button--${type}`,
      `aix-button--${size}`,
      {
        'aix-button--disabled': disabled,
        'aix-button--loading': loading,
      },
    ]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="aix-button__loading">
      <svg
        class="aix-button__loading-icon"
        viewBox="0 0 1024 1024"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896zm0 64a384 384 0 1 0 0 768 384 384 0 0 0 0-768z"
          fill="currentColor"
        />
        <path
          d="M512 64a32 32 0 0 1 32 32v128a32 32 0 0 1-64 0V96a32 32 0 0 1 32-32z"
          fill="currentColor"
        />
      </svg>
    </span>
    <span class="aix-button__content">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
/**
 * 按钮组件
 *
 * 用于触发操作和提交表单。支持多种类型、尺寸和状态。
 */
import type { ButtonProps, ButtonEmits } from './types';

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
});

const emit = defineEmits<ButtonEmits>();

const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};
</script>

<style scoped lang="scss">
.aix-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--aix-paddingXS) var(--aix-padding);
  transition: all 0.3s;
  border: 1px solid transparent;
  border-radius: var(--aix-borderRadiusSM);
  font-size: var(--aix-fontSize);
  line-height: var(--aix-lineHeight);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  gap: var(--aix-sizeXS);

  &:focus {
    outline: none;
  }

  &__loading {
    display: inline-flex;
    align-items: center;
  }

  &__loading-icon {
    width: var(--aix-fontSize);
    height: var(--aix-fontSize);
    animation: aix-button-loading-spin 1s linear infinite;
  }

  &__content {
    display: inline-flex;
    align-items: center;
  }

  /* 类型样式 - 使用主题变量 */
  &--primary {
    border-color: var(--aix-colorPrimary);
    background-color: var(--aix-colorPrimary);
    color: var(--aix-colorTextLight);

    &:hover:not(.aix-button--disabled) {
      border-color: var(--aix-colorPrimaryHover);
      background-color: var(--aix-colorPrimaryHover);
    }

    &:active:not(.aix-button--disabled) {
      border-color: var(--aix-colorPrimaryActive);
      background-color: var(--aix-colorPrimaryActive);
    }
  }

  &--default {
    border-color: var(--aix-colorBorder);
    background-color: var(--aix-colorBgContainer);
    color: var(--aix-colorText);

    &:hover:not(.aix-button--disabled) {
      border-color: var(--aix-colorPrimaryHover);
      color: var(--aix-colorPrimaryHover);
    }

    &:active:not(.aix-button--disabled) {
      border-color: var(--aix-colorPrimaryActive);
      color: var(--aix-colorPrimaryActive);
    }
  }

  &--dashed {
    border-style: dashed;
    border-color: var(--aix-colorBorder);
    background-color: var(--aix-colorBgContainer);
    color: var(--aix-colorText);

    &:hover:not(.aix-button--disabled) {
      border-color: var(--aix-colorPrimaryHover);
      color: var(--aix-colorPrimaryHover);
    }

    &:active:not(.aix-button--disabled) {
      border-color: var(--aix-colorPrimaryActive);
      color: var(--aix-colorPrimaryActive);
    }
  }

  &--text {
    border-color: transparent;
    background-color: transparent;
    color: var(--aix-colorText);

    &:hover:not(.aix-button--disabled) {
      background-color: var(--aix-colorBgTextHover);
    }

    &:active:not(.aix-button--disabled) {
      background-color: var(--aix-colorBgTextActive);
    }
  }

  &--link {
    border-color: transparent;
    background-color: transparent;
    color: var(--aix-colorLink);

    &:hover:not(.aix-button--disabled) {
      color: var(--aix-colorLinkHover);
    }

    &:active:not(.aix-button--disabled) {
      color: var(--aix-colorLinkActive);
    }
  }

  /* 尺寸样式 - 使用主题变量 */
  &--small {
    padding: var(--aix-paddingXXS) var(--aix-paddingXS);
    font-size: var(--aix-fontSizeXS);

    .aix-button__loading-icon {
      width: var(--aix-fontSizeXS);
      height: var(--aix-fontSizeXS);
    }
  }

  &--medium {
    padding: var(--aix-paddingXS) var(--aix-padding);
    font-size: var(--aix-fontSize);

    .aix-button__loading-icon {
      width: var(--aix-fontSize);
      height: var(--aix-fontSize);
    }
  }

  &--large {
    padding: var(--aix-paddingSM) var(--aix-paddingLG);
    font-size: var(--aix-fontSizeLG);

    .aix-button__loading-icon {
      width: var(--aix-fontSizeLG);
      height: var(--aix-fontSizeLG);
    }
  }

  /* 禁用状态 */
  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 加载状态 */
  &--loading {
    cursor: default;
  }
}

@keyframes aix-button-loading-spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}
</style>
