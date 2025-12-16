<template>
  <div
    :class="[
      'aix-sources',
      { 'aix-sources--collapsed': isCollapsed },
      { 'aix-sources--disabled': disabled },
      className,
      classNames?.root,
    ]"
    :style="styles?.root"
  >
    <!-- 头部 -->
    <div
      v-if="title || collapsible"
      :class="['aix-sources__header', classNames?.header]"
      :style="styles?.header"
      @click="collapsible ? toggleCollapse() : undefined"
    >
      <slot name="header">
        <span class="aix-sources__title">
          <Book class="aix-sources__title-icon" />
          {{ title || '引用来源' }}
          <span class="aix-sources__count">({{ items.length }})</span>
        </span>
      </slot>

      <!-- 折叠按钮 -->
      <button
        v-if="collapsible"
        class="aix-sources__toggle"
        :aria-expanded="!isCollapsed"
        type="button"
      >
        <ArrowDropDown
          :class="[
            'aix-sources__toggle-icon',
            { 'aix-sources__toggle-icon--expanded': !isCollapsed },
          ]"
        />
      </button>
    </div>

    <!-- 列表 -->
    <div
      v-show="!isCollapsed"
      :class="['aix-sources__list', classNames?.list]"
      :style="styles?.list"
    >
      <slot :items="displayItems" :expanded="isExpanded">
        <SourceItem
          v-for="(item, index) in displayItems"
          :key="item.key"
          :item="item"
          :index="showIndex ? index + 1 : undefined"
          :show-index="showIndex"
          :target="target"
          :disabled="disabled"
          :class="classNames?.item"
          :style="styles?.item"
          @click="handleItemClick"
        >
          <template v-if="$slots.icon" #icon>
            <slot name="icon" :item="item" :index="index" />
          </template>
        </SourceItem>
      </slot>

      <!-- 展开更多按钮 -->
      <button
        v-if="hasMore && !isExpanded"
        class="aix-sources__expand"
        type="button"
        @click="handleExpand"
      >
        <span>展开更多 ({{ items.length - maxCount! }})</span>
        <ArrowDropDown />
      </button>

      <!-- 收起按钮 -->
      <button
        v-if="hasMore && isExpanded"
        class="aix-sources__collapse-btn"
        type="button"
        @click="isExpanded = false"
      >
        <span>收起</span>
        <ArrowDropUp />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Sources 引用来源组件
 */
import { Book, ArrowDropDown, ArrowDropUp } from '@aix/icons';
import { ref, computed } from 'vue';
import SourceItem from './SourceItem.vue';
import type {
  SourcesProps,
  SourcesEmits,
  SourceItem as SourceItemType,
} from './types';

const props = withDefaults(defineProps<SourcesProps>(), {
  title: '引用来源',
  collapsible: false,
  defaultCollapsed: false,
  showIndex: true,
  target: '_blank',
  disabled: false,
});

const emit = defineEmits<SourcesEmits>();

// 折叠状态
const isCollapsed = ref(props.defaultCollapsed);

// 展开更多状态
const isExpanded = ref(false);

// 是否有更多
const hasMore = computed(() => {
  return props.maxCount !== undefined && props.items.length > props.maxCount;
});

// 显示的列表
const displayItems = computed(() => {
  if (!hasMore.value || isExpanded.value) {
    return props.items;
  }
  return props.items.slice(0, props.maxCount);
});

/** 切换折叠 */
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
  emit('collapse', isCollapsed.value);
}

/** 处理点击来源项 */
function handleItemClick(item: SourceItemType) {
  emit('click', item);
}

/** 展开更多 */
function handleExpand() {
  isExpanded.value = true;
  emit('expand');
}

/** 暴露方法 */
defineExpose({
  /** 折叠 */
  collapse: () => {
    isCollapsed.value = true;
    emit('collapse', true);
  },
  /** 展开 */
  expand: () => {
    isCollapsed.value = false;
    emit('collapse', false);
  },
  /** 展开全部来源 */
  expandAll: () => {
    isExpanded.value = true;
    emit('expand');
  },
});
</script>

<style scoped lang="scss">
.aix-sources {
  border: 1px solid var(--colorBorderSecondary, #f0f0f0);
  border-radius: var(--borderRadius, 8px);
  background: var(--colorBgContainer, #fff);
  overflow: hidden;

  &--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--paddingSM, 12px) var(--paddingMD, 16px);
    border-bottom: 1px solid var(--colorBorderSecondary, #f0f0f0);
    background: var(--colorBgLayout, #fafafa);
    cursor: pointer;
    user-select: none;

    &:hover {
      background: var(--colorBgTextHover, rgba(0, 0, 0, 0.04));
    }
  }

  &--collapsed &__header {
    border-bottom: none;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: var(--paddingXS, 8px);
    font-size: var(--fontSizeSM, 14px);
    font-weight: 500;
    color: var(--colorText, #333);
  }

  &__title-icon {
    width: 16px;
    height: 16px;
    color: var(--colorTextSecondary, #666);
  }

  &__count {
    font-weight: 400;
    color: var(--colorTextSecondary, #666);
  }

  &__toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  &__toggle-icon {
    width: 16px;
    height: 16px;
    color: var(--colorTextSecondary, #666);
    transition: transform 0.2s ease;

    &--expanded {
      transform: rotate(180deg);
    }
  }

  &__list {
    padding: var(--paddingXS, 8px);
  }

  &__expand,
  &__collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--paddingXXS, 4px);
    width: 100%;
    padding: var(--paddingXS, 8px);
    margin-top: var(--paddingXS, 8px);
    border: 1px dashed var(--colorBorder, #d9d9d9);
    border-radius: var(--borderRadiusSM, 4px);
    background: transparent;
    color: var(--colorTextSecondary, #666);
    font-size: var(--fontSizeSM, 14px);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--colorPrimary, #1890ff);
      color: var(--colorPrimary, #1890ff);
    }

    svg {
      width: 14px;
      height: 14px;
    }
  }
}
</style>
