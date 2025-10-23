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
import type { ButtonProps, ButtonEmits } from './types';

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
});

const emit = defineEmits<ButtonEmits>();

/**
 * 多语言支持示例（可选）
 *
 * Button 组件本身不直接使用多语言文案（文案通过插槽传入）
 * 但组件提供了 buttonLocale，可在应用中使用：
 *
 * const { t } = useLocale(buttonLocale);
 * // t.value 包含：
 * // - Button 特有文案：loadingText, clickMe, submitButton
 * // - 公共文案：confirm, cancel, add, save, delete, edit 等
 *
 * 使用示例：
 * <Button>{{ t.clickMe }}</Button>
 * <Button :loading="true">{{ t.loadingText }}</Button>
 */

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
  padding: var(--paddingXS) var(--padding);
  transition: all 0.3s;
  border: 1px solid transparent;
  border-radius: var(--borderRadiusSM);
  font-size: var(--fontSize);
  line-height: var(--lineHeight);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  gap: var(--sizeXS);

  &:focus {
    outline: none;
  }

  &__loading {
    display: inline-flex;
    align-items: center;
  }

  &__loading-icon {
    width: var(--fontSize);
    height: var(--fontSize);
    animation: aix-button-loading-spin 1s linear infinite;
  }

  &__content {
    display: inline-flex;
    align-items: center;
  }

  /* 类型样式 - 使用主题变量 */
  &--primary {
    border-color: var(--colorPrimary);
    background-color: var(--colorPrimary);
    color: var(--colorTextLight);

    &:hover:not(.aix-button--disabled) {
      border-color: var(--colorPrimaryHover);
      background-color: var(--colorPrimaryHover);
    }

    &:active:not(.aix-button--disabled) {
      border-color: var(--colorPrimaryActive);
      background-color: var(--colorPrimaryActive);
    }
  }

  &--default {
    border-color: var(--colorBorder);
    background-color: var(--colorBgContainer);
    color: var(--colorText);

    &:hover:not(.aix-button--disabled) {
      border-color: var(--colorPrimaryHover);
      color: var(--colorPrimaryHover);
    }

    &:active:not(.aix-button--disabled) {
      border-color: var(--colorPrimaryActive);
      color: var(--colorPrimaryActive);
    }
  }

  &--dashed {
    border-style: dashed;
    border-color: var(--colorBorder);
    background-color: var(--colorBgContainer);
    color: var(--colorText);

    &:hover:not(.aix-button--disabled) {
      border-color: var(--colorPrimaryHover);
      color: var(--colorPrimaryHover);
    }

    &:active:not(.aix-button--disabled) {
      border-color: var(--colorPrimaryActive);
      color: var(--colorPrimaryActive);
    }
  }

  &--text {
    border-color: transparent;
    background-color: transparent;
    color: var(--colorText);

    &:hover:not(.aix-button--disabled) {
      background-color: var(--colorBgTextHover);
    }

    &:active:not(.aix-button--disabled) {
      background-color: var(--colorBgTextActive);
    }
  }

  &--link {
    border-color: transparent;
    background-color: transparent;
    color: var(--colorLink);

    &:hover:not(.aix-button--disabled) {
      color: var(--colorLinkHover);
    }

    &:active:not(.aix-button--disabled) {
      color: var(--colorLinkActive);
    }
  }

  /* 尺寸样式 - 使用主题变量 */
  &--small {
    padding: var(--paddingXXS) var(--paddingXS);
    font-size: var(--fontSizeXS);

    .aix-button__loading-icon {
      width: var(--fontSizeXS);
      height: var(--fontSizeXS);
    }
  }

  &--medium {
    padding: var(--paddingXS) var(--padding);
    font-size: var(--fontSize);

    .aix-button__loading-icon {
      width: var(--fontSize);
      height: var(--fontSize);
    }
  }

  &--large {
    padding: var(--paddingSM) var(--paddingLG);
    font-size: var(--fontSizeLG);

    .aix-button__loading-icon {
      width: var(--fontSizeLG);
      height: var(--fontSizeLG);
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
