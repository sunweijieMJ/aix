<template>
  <span
    :id="triggerId"
    ref="triggerRef"
    class="aix-dropdown__trigger"
    :aria-expanded="isOpen"
    aria-haspopup="menu"
    v-on="referenceListeners"
  >
    <slot name="reference" />
  </span>
  <Teleport :to="teleportTo" :disabled="teleportDisabled">
    <Transition
      name="aix-popper-fade-fast"
      @after-enter="onShow"
      @after-leave="onHide"
    >
      <div
        v-if="isOpen"
        ref="floatingElRef"
        :class="['aix-dropdown', popperClass]"
        :style="mergedStyles"
        v-on="floatingListeners"
      >
        <ul
          class="aix-dropdown__menu"
          role="menu"
          :aria-labelledby="triggerId"
          @keydown="onMenuKeyDown"
        >
          <slot name="dropdown">
            <DropdownItem
              v-for="item in options"
              :key="item.command"
              :command="item.command"
              :label="item.label"
              :disabled="item.disabled"
              :divided="item.divided"
            />
          </slot>
        </ul>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, provide, ref, useId, watch } from 'vue';
import { createMenuKeyDown } from '../composables/useMenuKeyboard';
import { usePopper } from '../composables/usePopper';
import { usePopperTrigger } from '../composables/usePopperTrigger';
import { useZIndex } from '../composables/useZIndex';
import { DROPDOWN_INJECTION_KEY } from '../types';
import type { DropdownProps, DropdownEmits, DropdownExpose } from '../types';
import DropdownItem from './DropdownItem.vue';

defineOptions({
  name: 'AixDropdown',
});

const props = withDefaults(defineProps<DropdownProps>(), {
  trigger: 'click',
  placement: 'bottom-start',
  disabled: false,
  open: undefined,
  hideOnClick: true,
  showDelay: 150,
  hideDelay: 150,
  teleportTo: 'body',
  teleportDisabled: false,
});

const emit = defineEmits<DropdownEmits>();

// 唯一 ID
const triggerId = `aix-dropdown-trigger-${useId()}`;

// 模板 refs
const triggerRef = ref<HTMLElement | null>(null);
const floatingElRef = ref<HTMLElement | null>(null);

// 核心定位
const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: () => props.placement,
  offset: 4,
  arrow: false,
});

// 桥接 refs
watch(triggerRef, (el) => {
  referenceRef.value = el;
});
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

// 触发器（支持受控模式）
const { isOpen, show, hide, referenceListeners, floatingListeners } =
  usePopperTrigger({
    trigger: () => props.trigger,
    disabled: () => props.disabled,
    showDelay: () => (props.trigger === 'hover' ? props.showDelay : 0),
    hideDelay: () => (props.trigger === 'hover' ? props.hideDelay : 0),
    open: () => props.open,
    onOpenChange: (val) => emit('update:open', val),
    referenceRef,
    floatingRef,
  });

function onShow() {
  emit('visible-change', true);
}

function onHide() {
  emit('visible-change', false);
}

function handleCommand(command: string | number | undefined) {
  if (command != null) {
    emit('command', command);
  }
  if (props.hideOnClick) {
    hide();
  }
}

provide(DROPDOWN_INJECTION_KEY, { handleItemClick: handleCommand });

// 键盘导航（Escape 由 usePopperTrigger 的 document 级监听统一处理）
const onMenuKeyDown = createMenuKeyDown();

// 动态 z-index：每次打开时递增，保证最后打开的浮层在最上方
const { currentZIndex, nextZIndex } = useZIndex();
watch(isOpen, (val) => {
  if (val) {
    nextZIndex();
    // 菜单打开后聚焦第一个菜单项，启用键盘导航
    nextTick(() => {
      const firstItem = floatingElRef.value?.querySelector<HTMLElement>(
        '.aix-dropdown__item:not(.aix-dropdown__item--disabled)',
      );
      firstItem?.focus();
    });
  } else {
    // 菜单关闭后归还焦点到触发器
    triggerRef.value?.focus();
  }
});

const mergedStyles = computed(() => ({
  ...floatingStyles.value,
  zIndex: currentZIndex.value,
}));

defineExpose<DropdownExpose>({
  show,
  hide,
});
</script>
