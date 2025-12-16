<template>
  <div :class="['aix-actions', className, `aix-actions--${variant}`]">
    <div class="aix-actions__items">
      <!-- 主操作项 -->
      <button
        v-for="(item, index) in mainItems"
        :key="item.key"
        :class="[
          'aix-actions__item',
          {
            'aix-actions__item--disabled': item.disabled || disabled,
            'aix-actions__item--danger': item.danger,
          },
        ]"
        :disabled="item.disabled || disabled"
        @click="handleAction(item)"
      >
        <slot name="item" :item="item" :index="index">
          <span v-if="item.icon" class="aix-actions__icon">
            <template v-if="typeof item.icon === 'string'">
              {{ item.icon }}
            </template>
            <component :is="item.icon" v-else />
          </span>
          <span v-if="item.label" class="aix-actions__label">{{
            item.label
          }}</span>
        </slot>
      </button>

      <!-- 更多菜单（如果有子项） -->
      <div v-if="hasChildren" class="aix-actions__more">
        <button
          :class="['aix-actions__item', 'aix-actions__more-trigger']"
          :disabled="disabled"
          @click="toggleMoreMenu"
        >
          <span class="aix-actions__icon">⋯</span>
        </button>

        <!-- 下拉菜单 -->
        <div v-if="showMoreMenu" class="aix-actions__dropdown">
          <slot name="children" :items="childrenItems">
            <div
              v-for="child in childrenItems"
              :key="child.key"
              :class="[
                'aix-actions__dropdown-item',
                {
                  'aix-actions__dropdown-item--disabled':
                    child.disabled || disabled,
                  'aix-actions__dropdown-item--danger': child.danger,
                },
              ]"
              @click="handleAction(child)"
            >
              <span v-if="child.icon" class="aix-actions__icon">
                <template v-if="typeof child.icon === 'string'">
                  {{ child.icon }}
                </template>
                <component :is="child.icon" v-else />
              </span>
              <span class="aix-actions__label">{{ child.label }}</span>
            </div>
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { ActionItem, ActionsProps, ActionsEmits } from './types';

/**
 * @fileoverview Actions 组件
 * @see ./types.ts - 类型定义
 */

const props = withDefaults(defineProps<ActionsProps>(), {
  items: () => [],
  variant: 'text',
  disabled: false,
});

const emit = defineEmits<ActionsEmits>();

const showMoreMenu = ref(false);

/*  主操作项（没有children的） */
const mainItems = computed(() => {
  return props.items.filter(
    (item) => !item.children || item.children.length === 0,
  );
});

/*  子菜单项（有children的展开） */
const childrenItems = computed(() => {
  return props.items
    .filter((item) => item.children && item.children.length > 0)
    .flatMap((item) => item.children || []);
});

const hasChildren = computed(() => childrenItems.value.length > 0);

const handleAction = (item: ActionItem) => {
  if (item.disabled || props.disabled) return;
  emit('action', item.key, item);
  showMoreMenu.value = false;
};

const toggleMoreMenu = () => {
  if (props.disabled) return;
  showMoreMenu.value = !showMoreMenu.value;
};

/*  点击外部关闭菜单 */
const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.aix-actions__more')) {
    showMoreMenu.value = false;
  }
};

/*  添加/移除全局点击监听 */
const setupClickOutside = () => {
  if (typeof window !== 'undefined') {
    document.addEventListener('click', handleClickOutside);
  }
};

const cleanupClickOutside = () => {
  if (typeof window !== 'undefined') {
    document.removeEventListener('click', handleClickOutside);
  }
};

/*  Lifecycle */
onMounted(setupClickOutside);
onUnmounted(cleanupClickOutside);

watch(showMoreMenu, (show) => {
  if (show) {
    setupClickOutside();
  } else {
    cleanupClickOutside();
  }
});
</script>

<style scoped lang="scss">
.aix-actions {
  display: inline-flex;
  gap: var(--paddingXS);
  align-items: center;

  &__items {
    display: flex;
    gap: var(--paddingXXS);
    align-items: center;
  }

  &__item {
    display: inline-flex;
    align-items: center;
    padding: var(--paddingXXS) var(--paddingXS);
    transition: all var(--aix-transition-base);
    border: none;
    border-radius: var(--borderRadiusSM);
    background: transparent;
    color: var(--colorText, #000000d9);
    font-size: var(--fontSizeSM);
    line-height: var(--lineHeight);
    cursor: pointer;
    gap: var(--paddingXXS);

    &:hover:not(&--disabled) {
      transform: translateY(-1px);
      background: var(--colorBgTextHover, #0000000a);
      box-shadow: var(--aix-shadow-xs);
    }

    &:active:not(&--disabled) {
      transform: translateY(0) scale(0.98);
      background: var(--colorBgTextActive, #00000014);
    }

    &--disabled {
      color: var(--colorTextDisabled, #00000040);
      cursor: not-allowed;
    }

    &--danger {
      color: var(--colorError, #ff4d4f);

      &:hover:not(.aix-actions__item--disabled) {
        transform: translateY(-1px);
        background: var(--colorErrorBg, #fff2f0);
        box-shadow: 0 1px 2px rgb(255 77 79 / 0.15);
      }
    }
  }

  &__icon {
    display: inline-flex;
    font-size: var(--fontSizeMD);
  }

  &__label {
    white-space: nowrap;
  }

  &__more {
    position: relative;
  }

  &__dropdown {
    position: absolute;
    z-index: 1050;
    top: 100%;
    right: 0;
    min-width: 120px;
    margin-top: var(--paddingXXS);
    padding: var(--paddingXXS);
    animation: dropdownSlideDown var(--aix-transition-base) ease-out;
    border-radius: var(--borderRadiusLG);
    background: var(--colorBgElevated, #fff);
    box-shadow: var(--aix-shadow-lg);

    &-item {
      display: flex;
      align-items: center;
      padding: 6px var(--paddingSM);
      transition: all var(--aix-transition-base);
      border-radius: var(--borderRadiusSM);
      color: var(--colorText, #000000d9);
      font-size: var(--fontSizeSM);
      line-height: var(--lineHeight);
      cursor: pointer;
      gap: var(--paddingXS);

      &:hover:not(&--disabled) {
        transform: translateX(2px);
        background: var(--colorBgTextHover, #0000000a);
      }

      &--disabled {
        color: var(--colorTextDisabled, #00000040);
        cursor: not-allowed;
      }

      &--danger {
        color: var(--colorError, #ff4d4f);

        &:hover:not(.aix-actions__dropdown-item--disabled) {
          transform: translateX(2px);
          background: var(--colorErrorBg, #fff2f0);
        }
      }
    }
  }

  /* Variants */
  &--outlined {
    .aix-actions__item {
      border: 1px solid var(--colorBorder, #d9d9d9);

      &:hover:not(.aix-actions__item--disabled) {
        border-color: var(--colorPrimaryHover, #40a9ff);
        box-shadow: var(--aix-shadow-sm);
      }
    }
  }

  &--filled {
    .aix-actions__item {
      background: var(--colorFillTertiary, #0000000a);

      &:hover:not(.aix-actions__item--disabled) {
        background: var(--colorFillSecondary, #00000014);
        box-shadow: var(--aix-shadow-xs);
      }
    }
  }
}

/*  下拉菜单动画 */
@keyframes dropdownSlideDown {
  from {
    transform: translateY(-8px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/*  响应式设计 */
@media (width <= 768px) {
  .aix-actions {
    &__item {
      padding: var(--paddingXXS) var(--paddingXS);
      font-size: var(--fontSizeXS);
    }

    &__icon {
      font-size: var(--fontSizeSM);
    }

    &__dropdown {
      min-width: 100px;

      &-item {
        padding: var(--paddingXXS) var(--paddingXS);
        font-size: var(--fontSizeXS);
      }
    }
  }
}
</style>
