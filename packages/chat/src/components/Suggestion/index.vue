<template>
  <div
    :class="[
      'aix-suggestion',
      `aix-suggestion--${layout}`,
      { 'aix-suggestion--wrap': wrap },
      { 'aix-suggestion--disabled': disabled },
      className,
      classNames?.root,
    ]"
    :style="listStyle"
  >
    <!-- 标题 -->
    <div
      v-if="title || $slots.title"
      :class="['aix-suggestion__title', classNames?.title]"
      :style="styles?.title"
    >
      <slot name="title">{{ title }}</slot>
    </div>

    <!-- 建议列表 -->
    <div
      :class="['aix-suggestion__list', classNames?.list]"
      :style="styles?.list"
    >
      <!-- 使用 itemRender 渲染（render props 模式） -->
      <template v-if="itemRender">
        <component
          :is="
            () =>
              itemRender!({ item, index, onClick: () => handleSelect(item) })
          "
          v-for="(item, index) in items"
          :key="item.key"
        />
      </template>

      <!-- 默认渲染 -->
      <template v-else>
        <div
          v-for="(item, index) in items"
          :key="item.key"
          :class="[
            'aix-suggestion__item',
            { 'aix-suggestion__item--disabled': item.disabled || disabled },
            classNames?.item,
          ]"
          :style="styles?.item"
          @click="handleSelect(item)"
        >
          <slot
            name="item"
            :item="item"
            :index="index"
            :on-click="() => handleSelect(item)"
          >
            <!-- 图标 -->
            <div v-if="item.icon" class="aix-suggestion__icon">
              <span v-if="typeof item.icon === 'string'">{{ item.icon }}</span>
              <component :is="item.icon" v-else />
            </div>

            <!-- 内容 -->
            <div class="aix-suggestion__content">
              <div class="aix-suggestion__label">{{ item.label }}</div>
              <div v-if="item.description" class="aix-suggestion__desc">
                {{ item.description }}
              </div>
            </div>

            <!-- 箭头 -->
            <div v-if="showArrow" class="aix-suggestion__arrow">
              <ArrowForward />
            </div>
          </slot>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Suggestion 智能建议组件
 * 展示 AI 生成的建议或推荐内容
 * 支持 render props 模式自定义渲染
 */
import { ArrowForward } from '@aix/icons';
import { computed } from 'vue';
import type { SuggestionProps, SuggestionEmits, SuggestionItem } from './types';

const props = withDefaults(defineProps<SuggestionProps>(), {
  items: () => [],
  layout: 'vertical',
  wrap: false,
  showArrow: true,
  disabled: false,
});

const emit = defineEmits<SuggestionEmits>();

// 计算列表样式（支持 columns）
const listStyle = computed(() => {
  const style: Record<string, string> = { ...props.styles?.root };
  if (props.columns && props.columns > 1) {
    style['--suggestion-columns'] = String(props.columns);
  }
  return style;
});

/**
 * 处理选择
 */
function handleSelect(item: SuggestionItem) {
  if (item.disabled || props.disabled) return;
  emit('select', item);
}
</script>

<style scoped lang="scss">
.aix-suggestion {
  --suggestion-columns: 1;

  &--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--colorTextSecondary, #666);
    margin-bottom: 12px;
  }

  &__list {
    display: flex;
    gap: 8px;
  }

  /* 垂直布局 */
  &--vertical &__list {
    flex-direction: column;
  }

  /* 水平布局 */
  &--horizontal &__list {
    flex-direction: row;
  }

  /* 换行模式 */
  &--wrap &__list {
    flex-wrap: wrap;
  }

  /* 多列布局 */
  &--vertical#{&}--wrap &__list {
    display: grid;
    grid-template-columns: repeat(var(--suggestion-columns), 1fr);
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--colorBgContainer, #fff);
    border: 1px solid var(--colorBorder, #d9d9d9);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(&--disabled) {
      border-color: var(--colorPrimary, #1677ff);
      background: var(--colorPrimaryBg, #e6f4ff);
      transform: translateX(4px);
    }

    &:active:not(&--disabled) {
      transform: translateX(2px);
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  /* 水平布局的项目 */
  &--horizontal &__item {
    flex: 0 0 auto;
  }

  /* 水平换行布局的项目 */
  &--horizontal#{&}--wrap &__item {
    flex: 1 1 calc(50% - 4px);
    min-width: 200px;
  }

  &__icon {
    font-size: 24px;
    flex-shrink: 0;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 24px;
      height: 24px;
    }
  }

  &__content {
    flex: 1;
    min-width: 0;
  }

  &__label {
    font-size: 14px;
    font-weight: 500;
    color: var(--colorText, #000);
    line-height: 1.4;
  }

  &__desc {
    font-size: 12px;
    color: var(--colorTextSecondary, #666);
    line-height: 1.4;
    margin-top: 4px;
  }

  &__arrow {
    flex-shrink: 0;
    opacity: 0.5;
    transition:
      opacity 0.2s,
      transform 0.2s;

    svg {
      width: 16px;
      height: 16px;
      color: var(--colorTextTertiary, #999);
    }

    .aix-suggestion__item:hover & {
      opacity: 1;
      transform: translateX(2px);
    }
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .aix-suggestion {
    --suggestion-columns: 1 !important;

    &--horizontal &__list {
      flex-direction: column;
    }

    &--horizontal#{&}--wrap &__item {
      flex: 1 1 100%;
      min-width: 0;
    }

    &__item {
      padding: 10px;
      gap: 10px;

      &:hover:not(&--disabled) {
        transform: translateX(2px);
      }
    }

    &__icon {
      font-size: 20px;

      svg {
        width: 20px;
        height: 20px;
      }
    }
  }
}
</style>
