<template>
  <div :class="['aix-welcome', className]">
    <!-- 头部区域 -->
    <div class="aix-welcome__header">
      <!-- 头像 + 标题 + 音频图标 -->
      <div class="aix-welcome__header-row">
        <!-- 头像 -->
        <div v-if="avatar || $slots.avatar" class="aix-welcome__avatar">
          <slot name="avatar">
            <img
              v-if="avatar"
              :src="avatar"
              :alt="title"
              class="aix-welcome__avatar-img"
            />
          </slot>
        </div>

        <!-- 标题区域 -->
        <div class="aix-welcome__header-content">
          <!-- 主标题 + 音频图标 -->
          <div class="aix-welcome__title-row">
            <div v-if="title || $slots.title" class="aix-welcome__title">
              <slot name="title">{{ title }}</slot>
            </div>
            <div
              v-if="showAudioIcon || $slots.audioIcon"
              class="aix-welcome__audio-icon"
            >
              <slot name="audioIcon">
                <VolumeUp />
              </slot>
            </div>
          </div>

          <!-- 免责声明 -->
          <div
            v-if="disclaimer || $slots.disclaimer"
            class="aix-welcome__disclaimer"
          >
            <slot name="disclaimer">{{ disclaimer }}</slot>
          </div>
        </div>

        <!-- 右上角操作按钮 -->
        <div v-if="$slots.headerActions" class="aix-welcome__header-actions">
          <slot name="headerActions" />
        </div>
      </div>

      <!-- 描述 -->
      <div
        v-if="description || $slots.description"
        class="aix-welcome__description"
      >
        <slot name="description">{{ description }}</slot>
      </div>
    </div>

    <!-- 功能特性列表 -->
    <div
      v-if="features && features.length > 0"
      :class="[
        'aix-welcome__features',
        `aix-welcome__features--${layout}`,
        { [`aix-welcome__features--cols-${columns}`]: layout === 'grid' },
      ]"
    >
      <div
        v-for="feature in features"
        :key="feature.key"
        :class="[
          'aix-welcome__feature',
          { 'aix-welcome__feature--disabled': feature.disabled },
        ]"
        @click="handleFeatureClick(feature)"
      >
        <slot name="feature" :feature="feature">
          <!-- 图标 -->
          <div v-if="feature.icon" class="aix-welcome__feature-icon">
            {{ feature.icon }}
          </div>

          <!-- 内容 -->
          <div class="aix-welcome__feature-content">
            <div class="aix-welcome__feature-title">{{ feature.title }}</div>
            <div v-if="feature.description" class="aix-welcome__feature-desc">
              {{ feature.description }}
            </div>
          </div>
        </slot>
      </div>
    </div>

    <!-- 自定义内容插槽 -->
    <div v-if="$slots.default" class="aix-welcome__extra">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Welcome 欢迎组件
 * 用于展示欢迎信息和功能引导
 */

import { VolumeUp } from '@aix/icons';

/** 功能特性项 */
interface WelcomeFeature {
  key: string;
  icon?: string;
  title: string;
  description?: string;
  disabled?: boolean;
}

/** Welcome 组件 Props */
interface WelcomeProps {
  title?: string;
  description?: string;
  avatar?: string;
  disclaimer?: string;
  showAudioIcon?: boolean;
  features?: WelcomeFeature[];
  layout?: 'grid' | 'list';
  columns?: number;
  className?: string;
}

/** Welcome 组件 Emits */
interface WelcomeEmits {
  (e: 'featureClick', feature: WelcomeFeature): void;
}

withDefaults(defineProps<WelcomeProps>(), {
  layout: 'grid',
  columns: 2,
});

const emit = defineEmits<WelcomeEmits>();

/**
 * 处理功能项点击
 */
const handleFeatureClick = (feature: WelcomeFeature) => {
  if (feature.disabled) return;
  emit('featureClick', feature);
};
</script>

<style scoped lang="scss">
.aix-welcome {
  display: flex;
  flex-direction: column;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px 16px;
  gap: 24px;

  &__header {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__header-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  &__avatar {
    flex-shrink: 0;
    width: 72px;
    height: 72px;
    overflow: hidden;
    border-radius: 50%;
    background: linear-gradient(
      180deg,
      rgb(234 221 255 / 1) 0%,
      rgb(255 255 255 / 1) 100%
    );
  }

  &__avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__header-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    gap: 8px;
  }

  &__title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__title {
    color: #090c14;
    font-family:
      'PingFang TC',
      'PingFang SC',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: 24px;
    font-weight: 600;
    line-height: 1.3;
  }

  &__audio-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    transition: color 0.2s;
    color: rgb(0 0 0 / 0.65);
    cursor: pointer;

    svg {
      width: 100%;
      height: 100%;
    }

    &:hover {
      color: var(--colorPrimary, #1677ff);
    }
  }

  &__disclaimer {
    color: rgb(0 0 0 / 0.5);
    font-family:
      'PingFang SC',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.3;
  }

  &__header-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 8px;
  }

  &__description {
    color: rgb(34 39 39 / 0.8);
    font-family:
      'PingFang SC',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.25;
  }

  &__features {
    display: flex;
    gap: 16px;

    /* 网格布局 */
    &--grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);

      &.aix-welcome__features--cols-1 {
        grid-template-columns: repeat(1, 1fr);
      }

      &.aix-welcome__features--cols-2 {
        grid-template-columns: repeat(2, 1fr);
      }

      &.aix-welcome__features--cols-3 {
        grid-template-columns: repeat(3, 1fr);
      }

      &.aix-welcome__features--cols-4 {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    /* 列表布局 */
    &--list {
      flex-direction: column;
    }
  }

  &__feature {
    display: flex;
    align-items: flex-start;
    padding: 24px;
    transition: all 0.3s ease;
    border: 1px solid var(--colorBorder, #d9d9d9);
    border-radius: 12px;
    background: var(--colorBgContainer, #fff);
    cursor: pointer;
    gap: 16px;

    &:hover:not(&--disabled) {
      transform: translateY(-2px);
      border-color: var(--colorPrimary, #1677ff);
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.08);
    }

    &:active:not(&--disabled) {
      transform: translateY(0);
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__feature-icon {
    flex-shrink: 0;
    font-size: 40px;
    line-height: 1;
  }

  &__feature-content {
    flex: 1;
    min-width: 0;
  }

  &__feature-title {
    margin-bottom: 8px;
    color: var(--colorText, #000);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.4;
  }

  &__feature-desc {
    color: var(--colorTextSecondary, #666);
    font-size: 14px;
    line-height: 1.6;
  }

  &__extra {
    text-align: center;
  }
}

/*  响应式设计 */
@media (width <= 768px) {
  .aix-welcome {
    padding: 24px 16px;
    gap: 24px;

    &__title {
      font-size: 24px;
    }

    &__description {
      font-size: 14px;
    }

    &__features {
      &--grid {
        grid-template-columns: repeat(1, 1fr) !important;
      }
    }

    &__feature {
      padding: 16px;
      gap: 12px;
    }

    &__feature-icon {
      font-size: 32px;
    }

    &__feature-title {
      font-size: 16px;
    }

    &__feature-desc {
      font-size: 13px;
    }
  }
}
</style>
