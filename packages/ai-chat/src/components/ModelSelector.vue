<template>
  <div ref="root" :class="[ns.b(), ns.is('open', open)]">
    <button type="button" :class="ns.e('trigger')" @click="open = !open">
      <span :class="ns.e('dot')" />
      <span :class="ns.e('label')">{{ currentLabel }}</span>
      <ArrowDropDown :class="[ns.e('caret'), ns.is('open', open)]" />
    </button>
    <div v-if="open" :class="[ns.e('menu'), ns.em('menu', placement)]" role="listbox">
      <button
        v-for="opt in normalized"
        :key="opt.value"
        type="button"
        role="option"
        :aria-selected="opt.value === model"
        :class="[ns.e('option'), ns.is('active', opt.value === model)]"
        @click="select(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import type { ModelOption } from '../types';

export interface ModelSelectorProps {
  /** 可选模型列表 */
  options: ModelOption[];
  /** 未选中时占位文案 */
  placeholder?: string;
  /** 下拉展开方向，默认 bottom；位于面板底部时用 top 向上弹出 */
  placement?: 'top' | 'bottom';
}
</script>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { ArrowDropDown } from '@aix/icons';
import { useNamespace } from '../composables/useNamespace';

const props = withDefaults(defineProps<ModelSelectorProps>(), {
  placeholder: '',
  placement: 'bottom',
});
// v-model 绑定当前选中的 model value
const model = defineModel<string>();
const ns = useNamespace('model-selector');

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const normalized = computed(() =>
  props.options.map((o) => ({ value: o.value, label: o.label ?? o.value })),
);
const currentLabel = computed(
  () => normalized.value.find((o) => o.value === model.value)?.label ?? props.placeholder,
);

const select = (value: string) => {
  model.value = value;
  open.value = false;
};

// 点击组件外部关闭下拉
const onDocClick = (e: MouseEvent) => {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
};
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<style lang="scss">
.aix-model-selector {
  display: inline-flex;
  position: relative;

  &__trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--aix-marginXXS);
    height: var(--aix-controlHeightSM);
    padding: 0 var(--aix-paddingXS);
    transition: border-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: 999px;
    background: var(--aix-colorBgContainer);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;

    &:hover {
      border-color: var(--aix-colorPrimaryBorder);
    }
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--aix-colorPrimary);
  }

  &__caret {
    width: 14px;
    height: 14px;
    transition: transform var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    color: var(--aix-colorTextTertiary);
  }

  &__caret.is-open {
    transform: rotate(180deg);
  }

  &__menu {
    display: flex;
    position: absolute;
    z-index: 10;
    left: 0;
    flex-direction: column;
    min-width: 100%;
    padding: var(--aix-paddingXXS);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    background: var(--aix-colorBgElevated, var(--aix-colorBgContainer));
    box-shadow: var(--aix-shadowMD);
    white-space: nowrap;
  }

  &__menu--bottom {
    top: calc(100% + 4px);
  }

  &__menu--top {
    bottom: calc(100% + 4px);
  }

  &__option {
    padding: var(--aix-paddingXS) var(--aix-paddingSM);
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--aix-colorFillTertiary);
    }
  }

  &__option.is-active {
    color: var(--aix-colorPrimary);
  }
}
</style>
