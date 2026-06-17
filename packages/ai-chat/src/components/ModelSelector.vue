<template>
  <div ref="root" :class="[ns.b(), ns.is('open', open)]">
    <button
      ref="triggerRef"
      type="button"
      :class="ns.e('trigger')"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span :class="ns.e('dot')" />
      <span :class="ns.e('label')">{{ currentLabel }}</span>
      <ArrowDropDown :class="[ns.e('caret'), ns.is('open', open)]" />
    </button>
    <div
      v-if="open"
      ref="menuRef"
      :class="[ns.e('menu'), ns.em('menu', placement)]"
      role="listbox"
      @keydown="onMenuKeydown"
    >
      <button
        v-for="(opt, i) in normalized"
        :key="opt.value"
        type="button"
        role="option"
        :aria-selected="opt.value === model"
        :tabindex="i === activeIndex ? 0 : -1"
        :class="[ns.e('option'), ns.is('active', opt.value === model)]"
        @click="select(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
export interface ModelSelectorProps {
  /**
   * 当前选中的 model value（v-model）。可选；不传走非受控，由组件内部维护选中态。
   * 注意：不要设默认值——受控/非受控判定依赖此 prop 是否为 undefined（兼容 Vue 3.3 的 emit-only useModel），
   * 默认值交由 useControllable 的 defaultValue 兜底。
   */
  modelValue?: string;
  /** 可选模型列表 */
  options: ModelOption[];
  /** 未选中时占位文案 */
  placeholder?: string;
  /** 下拉展开方向，默认 bottom；位于面板底部时用 top 向上弹出 */
  placement?: 'top' | 'bottom';
}

export interface ModelSelectorEmits {
  /** 选中的 model value 变化（v-model） */
  (e: 'update:modelValue', value: string): void;
}
</script>

<script setup lang="ts">
import { useNamespace, useClickOutside, useControllable } from '@aix/hooks';
import { ArrowDropDown } from '@aix/icons';
import { ref, computed, nextTick } from 'vue';
import type { ModelOption } from '../types';

const props = withDefaults(defineProps<ModelSelectorProps>(), {
  placeholder: '',
  placement: 'bottom',
});
const emit = defineEmits<ModelSelectorEmits>();
// v-model 绑定当前选中的 model value。select() 内部写入，属「内部写入 + 支持非受控」场景，
// 故用 useControllable 兼容 Vue 3.3（useModel emit-only 非受控下本地写入会丢失）。prop modelValue 须无默认值。
const { state: model } = useControllable<string>({
  prop: () => props.modelValue,
  defaultValue: '',
  onChange: (v) => emit('update:modelValue', v),
});
const ns = useNamespace('model-selector');

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
// 键盘导航高亮项索引（roving tabindex）：展开时仅该项 tabindex=0，焦点随之移动
const activeIndex = ref(-1);

const normalized = computed(() =>
  props.options.map((o) => ({ value: o.value, label: o.label ?? o.value })),
);
const currentLabel = computed(
  () => normalized.value.find((o) => o.value === model.value)?.label ?? props.placeholder,
);

// 将焦点移到第 i 个选项（DOM 就绪后），配合 roving tabindex 实现方向键导航
const focusOption = (i: number) => {
  nextTick(() => {
    const items = menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    items?.[i]?.focus();
  });
};

const openMenu = () => {
  if (open.value) return;
  open.value = true;
  // 展开时高亮当前选中项，无选中则落在首项
  const selected = normalized.value.findIndex((o) => o.value === model.value);
  activeIndex.value = selected >= 0 ? selected : 0;
  focusOption(activeIndex.value);
};

const closeMenu = (focusTrigger = false) => {
  if (!open.value) return;
  open.value = false;
  activeIndex.value = -1;
  // Esc 关闭时把焦点交还触发按钮，符合 listbox 键盘交互预期
  if (focusTrigger) nextTick(() => triggerRef.value?.focus());
};

const toggle = () => (open.value ? closeMenu() : openMenu());

// 在选项间循环移动高亮（方向键），delta 为 +1/-1
const moveActive = (delta: number) => {
  const len = normalized.value.length;
  if (!len) return;
  activeIndex.value = (activeIndex.value + delta + len) % len;
  focusOption(activeIndex.value);
};

const select = (value: string) => {
  model.value = value;
  closeMenu(true);
};

const onTriggerKeydown = (e: KeyboardEvent) => {
  // 触发按钮：方向键展开并聚焦选项；Esc 关闭。Enter/Space 由按钮原生 click→toggle 处理
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    openMenu();
  } else if (e.key === 'Escape' && open.value) {
    e.preventDefault();
    closeMenu(true);
  }
};

const onMenuKeydown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      moveActive(1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      moveActive(-1);
      break;
    case 'Home':
      e.preventDefault();
      activeIndex.value = 0;
      focusOption(0);
      break;
    case 'End':
      e.preventDefault();
      activeIndex.value = normalized.value.length - 1;
      focusOption(activeIndex.value);
      break;
    case 'Escape':
      e.preventDefault();
      closeMenu(true);
      break;
    case 'Tab':
      // 焦点离开下拉时关闭（不抢占 Tab 的默认移焦行为）。
      // roving tabindex 下仅高亮项 tabindex=0、其余 -1，故原生 Tab 会跳过同级选项直接移出组件，
      // 此处只需关闭菜单做清理，不要回移焦点（否则原生 Tab 会重新进入菜单、随后被卸载致焦点回落 body）。
      closeMenu();
      break;
    // Enter / Space 选中由选项按钮原生 click 处理，无需在此拦截
  }
};

// 点击组件外部关闭下拉（统一用 @aix/hooks 的 useClickOutside，仅在打开时监听）
useClickOutside({
  excludeRefs: computed(() => [root.value]),
  handler: () => closeMenu(),
  enabled: open,
});
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
