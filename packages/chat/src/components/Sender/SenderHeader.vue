<template>
  <div
    :class="[
      'aix-sender-header',
      `aix-sender-header--${direction}`,
      { 'aix-sender-header--expanded': isExpanded },
      { 'aix-sender-header--collapsible': collapsible },
      { 'aix-sender-header--disabled': disabled },
      className,
      classNames?.root,
    ]"
    :style="styles?.root"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 头部栏（点击/hover触发展开） -->
    <div
      v-if="collapsible && (title || $slots.title)"
      :class="['aix-sender-header__header', classNames?.header]"
      :style="styles?.header"
      @click="trigger === 'click' ? toggleExpand() : undefined"
    >
      <span
        :class="['aix-sender-header__title', classNames?.title]"
        :style="styles?.title"
      >
        <slot name="title">{{ title }}</slot>
      </span>
      <button
        v-if="trigger === 'click'"
        type="button"
        :class="['aix-sender-header__toggle', classNames?.toggle]"
        :style="styles?.toggle"
        :aria-expanded="isExpanded"
        @click.stop="toggleExpand"
      >
        <ArrowDropUp
          :class="[
            'aix-sender-header__toggle-icon',
            { 'aix-sender-header__toggle-icon--expanded': isExpanded },
          ]"
          :style="{
            transform: direction === 'down' ? 'rotate(180deg)' : undefined,
          }"
        />
      </button>
    </div>

    <!-- 分隔线 -->
    <div
      v-if="showDivider && isExpanded"
      :class="['aix-sender-header__divider', classNames?.divider]"
      :style="styles?.divider"
    />

    <!-- 内容区域 -->
    <Transition name="aix-sender-header-expand">
      <div
        v-show="isExpanded || trigger === 'always'"
        :class="['aix-sender-header__content', classNames?.content]"
        :style="[styles?.content, maxHeightStyle]"
      >
        <slot />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Sender.Header 可折叠头部组件
 */
import { ArrowDropUp } from '@aix/icons';
import { ref, computed, watch } from 'vue';
import type { SenderHeaderProps, SenderHeaderEmits } from './types';

const props = withDefaults(defineProps<SenderHeaderProps>(), {
  collapsible: true,
  defaultExpanded: false,
  direction: 'up',
  trigger: 'click',
  showDivider: false,
  disabled: false,
});

const emit = defineEmits<SenderHeaderEmits>();

// 展开状态
const internalExpanded = ref(props.defaultExpanded);

// 支持受控模式
const isExpanded = computed({
  get: () =>
    props.expanded !== undefined ? props.expanded : internalExpanded.value,
  set: (val: boolean) => {
    internalExpanded.value = val;
    emit('update:expanded', val);
  },
});

// 监听 expanded prop 变化
watch(
  () => props.expanded,
  (val) => {
    if (val !== undefined) {
      internalExpanded.value = val;
    }
  },
);

// 最大高度样式
const maxHeightStyle = computed(() => {
  if (!props.maxHeight) return {};
  const value =
    typeof props.maxHeight === 'number'
      ? `${props.maxHeight}px`
      : props.maxHeight;
  return { maxHeight: value, overflow: 'auto' };
});

// 切换展开状态
function toggleExpand() {
  if (props.disabled) return;
  const newVal = !isExpanded.value;
  isExpanded.value = newVal;
  emit('toggle', newVal);
}

// hover 触发
function handleMouseEnter() {
  if (props.trigger === 'hover' && !props.disabled) {
    isExpanded.value = true;
    emit('toggle', true);
  }
}

function handleMouseLeave() {
  if (props.trigger === 'hover' && !props.disabled) {
    isExpanded.value = false;
    emit('toggle', false);
  }
}

/** 暴露方法 */
defineExpose({
  expand: () => {
    isExpanded.value = true;
    emit('toggle', true);
  },
  collapse: () => {
    isExpanded.value = false;
    emit('toggle', false);
  },
  toggle: toggleExpand,
  isExpanded,
});
</script>

<style scoped lang="scss">
.aix-sender-header {
  display: flex;
  flex-direction: column;
  width: 100%;

  &--up {
    /* 内容在上，头部栏在下 */
    flex-direction: column-reverse;
  }

  &--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--paddingXS, 8px) var(--paddingSM, 12px);
    cursor: pointer;
    user-select: none;
    transition: background 0.2s ease;

    &:hover {
      background: rgba(0, 0, 0, 0.02);
    }
  }

  &__title {
    flex: 1;
    font-size: var(--fontSizeSM, 14px);
    color: var(--colorTextSecondary, #666);
  }

  &__toggle {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: var(--borderRadiusSM, 4px);
    transition: background 0.2s ease;

    &:hover {
      background: rgba(0, 0, 0, 0.04);
    }
  }

  &__toggle-icon {
    width: 16px;
    height: 16px;
    color: var(--colorTextTertiary, #999);
    transition: transform 0.3s ease;

    &--expanded {
      transform: rotate(180deg);
    }
  }

  &__divider {
    height: 1px;
    background: var(--colorBorderSecondary, #f0f0f0);
    margin: 0 var(--paddingSM, 12px);
  }

  &__content {
    padding: var(--paddingSM, 12px);
  }
}

// 展开/折叠动画
.aix-sender-header-expand-enter-active,
.aix-sender-header-expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.aix-sender-header-expand-enter-from,
.aix-sender-header-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.aix-sender-header-expand-enter-to,
.aix-sender-header-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
