<template>
  <span
    ref="triggerRef"
    class="aix-context-menu__trigger"
    aria-haspopup="menu"
    @contextmenu.prevent="handleContextMenu"
  >
    <slot />
  </span>
  <Teleport :to="teleportTo" :disabled="teleportDisabled">
    <Transition
      name="aix-popper-fade"
      @after-enter="emit('visible-change', true)"
      @after-leave="emit('visible-change', false)"
    >
      <div
        v-if="isOpen"
        ref="floatingElRef"
        :class="['aix-context-menu', popperClass]"
        :style="mergedStyles"
      >
        <ul
          class="aix-context-menu__menu"
          role="menu"
          aria-label="上下文菜单"
          @keydown="onMenuKeyDown"
        >
          <slot name="menu" />
        </ul>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, provide, ref, watch, onBeforeUnmount } from 'vue';
import { useClickOutside } from '../composables/useClickOutside';
import { createMenuKeyDown } from '../composables/useMenuKeyboard';
import { usePopper } from '../composables/usePopper';
import { useZIndex } from '../composables/useZIndex';
import { DROPDOWN_INJECTION_KEY } from '../types';
import type {
  ContextMenuProps,
  ContextMenuEmits,
  ContextMenuExpose,
} from '../types';

defineOptions({
  name: 'AixContextMenu',
});

const props = withDefaults(defineProps<ContextMenuProps>(), {
  disabled: false,
  teleportTo: 'body',
  teleportDisabled: false,
});

const emit = defineEmits<ContextMenuEmits>();

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const floatingElRef = ref<HTMLElement | null>(null);

// 核心定位（使用 usePopper 统一架构，strategy: fixed 适合右键菜单）
const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: 'bottom-start',
  strategy: 'fixed',
  offset: 4,
  arrow: false,
  flip: true,
  shift: true,
});

// 桥接 refs
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

function handleContextMenu(event: MouseEvent) {
  if (props.disabled) return;

  const { clientX, clientY } = event;
  // 使用虚拟元素定位到鼠标坐标
  referenceRef.value = {
    getBoundingClientRect: () => ({
      width: 0,
      height: 0,
      x: clientX,
      y: clientY,
      top: clientY,
      left: clientX,
      right: clientX,
      bottom: clientY,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement;
  isOpen.value = true;
}

function hide() {
  isOpen.value = false;
}

function handleCommand(command?: string | number) {
  if (command != null) {
    emit('command', command);
  }
  hide();
}

provide(DROPDOWN_INJECTION_KEY, { handleItemClick: handleCommand });

// 键盘导航（DropdownItem 渲染 .aix-dropdown__item，使用默认选择器）
// Escape 由 document 级 keydown 统一处理，避免重复调用 hide()
const onMenuKeyDown = createMenuKeyDown();

function show(event: MouseEvent) {
  handleContextMenu(event);
}

// 点击外部关闭（排除触发元素和浮动元素）
useClickOutside({
  excludeRefs: computed(() => [triggerRef.value, floatingElRef.value]),
  handler: hide,
  enabled: isOpen,
});

// Esc 关闭
function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') hide();
}

// 动态 z-index：每次打开时递增，保证最后打开的浮层在最上方
const { currentZIndex, nextZIndex } = useZIndex();

watch(isOpen, (val) => {
  if (typeof document === 'undefined') return;
  if (val) {
    nextZIndex();
    document.addEventListener('keydown', onKeyDown);
    // 菜单打开后聚焦第一个菜单项，启用键盘导航
    nextTick(() => {
      const firstItem = floatingElRef.value?.querySelector<HTMLElement>(
        '.aix-dropdown__item:not(.aix-dropdown__item--disabled)',
      );
      firstItem?.focus();
    });
  } else {
    document.removeEventListener('keydown', onKeyDown);
  }
});

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', onKeyDown);
  }
});

const mergedStyles = computed(() => ({
  ...floatingStyles.value,
  zIndex: currentZIndex.value,
}));

defineExpose<ContextMenuExpose>({
  show,
  hide,
});
</script>
