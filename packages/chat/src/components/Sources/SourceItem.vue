<template>
  <a
    :class="[
      'aix-source-item',
      { 'aix-source-item--disabled': disabled },
      className,
    ]"
    :href="item.url"
    :target="item.url ? target : undefined"
    :rel="target === '_blank' ? 'noopener noreferrer' : undefined"
    @click="handleClick"
  >
    <!-- 序号 -->
    <span
      v-if="showIndex && index !== undefined"
      class="aix-source-item__index"
    >
      {{ index }}
    </span>

    <!-- 图标 -->
    <span class="aix-source-item__icon">
      <slot name="icon">
        <span v-if="item.icon && typeof item.icon === 'string'">
          {{ item.icon }}
        </span>
        <component :is="item.icon" v-else-if="item.icon" />
        <img
          v-else-if="faviconUrl"
          :src="faviconUrl"
          :alt="item.domain || item.title"
          class="aix-source-item__favicon"
          @error="handleFaviconError"
        />
        <IconLink v-else />
      </slot>
    </span>

    <!-- 内容 -->
    <span class="aix-source-item__content">
      <span class="aix-source-item__title">{{ item.title }}</span>
      <span v-if="item.description" class="aix-source-item__desc">
        {{ item.description }}
      </span>
      <span v-if="displayDomain" class="aix-source-item__domain">
        {{ displayDomain }}
      </span>
    </span>

    <!-- 外链图标 -->
    <span v-if="item.url" class="aix-source-item__external">
      <Launch />
    </span>
  </a>
</template>

<script setup lang="ts">
/**
 * @fileoverview SourceItem 单个引用来源组件
 */
import { IconLink, Launch } from '@aix/icons';
import { computed, ref } from 'vue';
import type { SourceItemProps, SourceItemEmits } from './types';

const props = withDefaults(defineProps<SourceItemProps>(), {
  showIndex: false,
  target: '_blank',
  disabled: false,
});

const emit = defineEmits<SourceItemEmits>();

// favicon 加载失败标记
const faviconFailed = ref(false);

// 从 URL 解析域名
const displayDomain = computed(() => {
  if (props.item.domain) return props.item.domain;
  if (!props.item.url) return '';
  try {
    const url = new URL(props.item.url);
    return url.hostname.replace('www.', '');
  } catch {
    return '';
  }
});

// favicon URL
const faviconUrl = computed(() => {
  if (faviconFailed.value) return '';
  if (!props.item.url) return '';
  try {
    const url = new URL(props.item.url);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
  } catch {
    return '';
  }
});

/** 处理点击 */
function handleClick(e: MouseEvent) {
  if (props.disabled) {
    e.preventDefault();
    return;
  }
  emit('click', props.item);
}

/** 处理 favicon 加载失败 */
function handleFaviconError() {
  faviconFailed.value = true;
}
</script>

<style scoped lang="scss">
.aix-source-item {
  display: flex;
  align-items: center;
  padding: var(--paddingXS, 8px) var(--paddingSM, 12px);
  transition: all 0.2s ease;
  border-radius: var(--borderRadiusSM, 4px);
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  gap: var(--paddingXS, 8px);

  &:hover:not(&--disabled) {
    background: var(--colorBgTextHover, rgb(0 0 0 / 0.04));
  }

  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &__index {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--borderRadiusSM, 4px);
    background: var(--colorPrimaryBg, #e6f7ff);
    color: var(--colorPrimary, #1890ff);
    font-size: var(--fontSizeXS, 12px);
    font-weight: 500;
  }

  &__icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: var(--colorTextSecondary, #666);

    svg {
      width: 100%;
      height: 100%;
    }
  }

  &__favicon {
    width: 16px;
    height: 16px;
    border-radius: 2px;
  }

  &__content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }

  &__title {
    overflow: hidden;
    color: var(--colorText, #333);
    font-size: var(--fontSizeSM, 14px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__desc {
    overflow: hidden;
    color: var(--colorTextSecondary, #666);
    font-size: var(--fontSizeXS, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__domain {
    color: var(--colorTextTertiary, #999);
    font-size: var(--fontSizeXS, 12px);
  }

  &__external {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
    transition: opacity 0.2s ease;
    opacity: 0;
    color: var(--colorTextTertiary, #999);

    svg {
      width: 100%;
      height: 100%;
    }
  }

  &:hover &__external {
    opacity: 1;
  }
}
</style>
