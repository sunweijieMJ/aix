<template>
  <div :class="['aix-prompts', className]">
    <!-- 标题栏 -->
    <div v-if="title || allowRefresh" class="aix-prompts__header">
      <!-- 标题 -->
      <div v-if="title" class="aix-prompts__title">
        <slot name="title">{{ title }}</slot>
      </div>

      <!-- 刷新按钮 -->
      <button
        v-if="allowRefresh"
        class="aix-prompts__refresh"
        :disabled="loading"
        @click="handleRefresh"
      >
        <slot name="refresh">
          <span class="aix-prompts__refresh-text">换一换</span>
          <Refresh
            class="aix-prompts__refresh-icon"
            :class="{ 'aix-prompts__refresh-icon--spinning': loading }"
          />
        </slot>
      </button>
    </div>

    <!-- 提示词列表 -->
    <div
      :class="[
        'aix-prompts__list',
        `aix-prompts__list--${layout}`,
        { [`aix-prompts__list--cols-${columns}`]: layout === 'grid' },
      ]"
    >
      <div
        v-for="item in items"
        :key="item.key"
        :class="[
          'aix-prompts__item',
          { 'aix-prompts__item--disabled': item.disabled },
        ]"
        @click="handleClick(item)"
      >
        <slot name="item" :item="item">
          <!-- 图标 -->
          <div v-if="item.icon" class="aix-prompts__icon">
            {{ item.icon }}
          </div>

          <!-- 内容 -->
          <div class="aix-prompts__content">
            <div class="aix-prompts__label">{{ item.label }}</div>
            <div v-if="item.description" class="aix-prompts__desc">
              {{ item.description }}
            </div>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Prompts 组件
 *
 * 【类型定义策略】
 * 由于 rollup-plugin-vue@6.0.0 不支持 Vue 3.3+ 的外部类型导入特性，
 * Props 和 Emits 接口需要内联定义。
 *
 * @see ./types.ts - 导出类型定义（需手动保持同步）
 */

import { Refresh } from '@aix/icons';

/*  import { useLocale } from '@aix/hooks'; */
/*  import { chatLocale } from '../../locale'; */

/** 提示词项 */
interface PromptItem {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  prompt?: string;
  disabled?: boolean;
}

/** Prompts 组件 Props */
interface PromptsProps {
  title?: string;
  items: PromptItem[];
  layout?: 'grid' | 'list';
  columns?: number;
  allowRefresh?: boolean;
  loading?: boolean;
  className?: string;
}

/** Prompts 组件 Emits */
interface PromptsEmits {
  (e: 'select', item: PromptItem): void;
  (e: 'refresh'): void;
}

withDefaults(defineProps<PromptsProps>(), {
  layout: 'list',
  columns: 2,
  allowRefresh: false,
  loading: false,
});

const emit = defineEmits<PromptsEmits>();

/*  国际化 */
/*  const { t } = useLocale(chatLocale); */

/**
 * 点击处理
 */
const handleClick = (item: PromptItem) => {
  if (item.disabled) return;
  emit('select', item);
};

/**
 * 刷新处理
 */
const handleRefresh = () => {
  emit('refresh');
};
</script>

<style scoped lang="scss">
.aix-prompts {
  display: flex;
  flex-direction: column;
  gap: var(--padding);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--paddingSM);
  }

  &__title {
    font-family:
      'PingFang SC',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: var(--fontSizeLG);
    font-weight: 500;
    color: var(--colorText);
    line-height: 1.11;
  }

  &__refresh {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 10px;
    background-color: #ede3ff;
    border: 1px solid #ccbaec;
    border-radius: var(--aix-radius-4xl);
    cursor: pointer;
    transition: all var(--aix-transition-base);

    &:hover:not(:disabled) {
      background-color: #e0d1ff;
      transform: translateY(-2px);
      box-shadow: var(--aix-shadow-sm);
    }

    &:active:not(:disabled) {
      transform: translateY(0) scale(0.98);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  &__refresh-text {
    font-family:
      'PingFang SC',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: var(--fontSizeSM);
    font-weight: 400;
    color: var(--colorText);
    line-height: 1.4;
    letter-spacing: -0.02em;
  }

  &__refresh-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--colorText);

    &--spinning {
      animation: promtsSpin 0.6s linear infinite;
    }
  }

  &__list {
    display: flex;
    gap: var(--paddingXS);

    /* 网格布局 */
    &--grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);

      &.aix-prompts__list--cols-1 {
        grid-template-columns: repeat(1, 1fr);
      }

      &.aix-prompts__list--cols-2 {
        grid-template-columns: repeat(2, 1fr);
      }

      &.aix-prompts__list--cols-3 {
        grid-template-columns: repeat(3, 1fr);
      }

      &.aix-prompts__list--cols-4 {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    /* 列表布局（横向滚动） */
    &--list {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      flex-wrap: nowrap;

      &::-webkit-scrollbar {
        height: 4px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background: var(--colorFillTertiary);
        border-radius: var(--borderRadiusXS);

        &:hover {
          background: var(--colorFillSecondary);
        }
      }
    }
  }

  &__item {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--paddingXS);
    padding: 4px var(--padding);
    height: 40px;
    background-color: rgba(237, 237, 237, 0.49);
    border: none;
    border-radius: var(--aix-radius-4xl);
    cursor: pointer;
    transition: all var(--aix-transition-base);
    white-space: nowrap;
    flex-shrink: 0;

    &:hover:not(&--disabled) {
      background-color: rgba(237, 237, 237, 0.7);
      transform: translateY(-2px);
      box-shadow: var(--aix-shadow-md);
    }

    &:active:not(&--disabled) {
      transform: translateY(0) scale(0.98);
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__icon {
    font-size: var(--fontSizeMD);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__content {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  &__label {
    font-family:
      'PingFang SC',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: var(--fontSizeMD);
    font-weight: 400;
    color: var(--colorText);
    line-height: var(--lineHeight);
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  &__desc {
    display: none;
  }
}

/*  动画 */
@keyframes promtsSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/*  响应式设计 */
@media (max-width: 768px) {
  .aix-prompts {
    &__title {
      font-size: var(--fontSizeMD);
    }

    &__list {
      &--grid {
        grid-template-columns: repeat(1, 1fr) !important;
      }
    }

    &__item {
      padding: 4px var(--paddingSM);
      height: 36px;
    }

    &__label {
      font-size: var(--fontSizeSM);
    }

    &__desc {
      font-size: var(--fontSizeXS);
    }
  }
}
</style>
