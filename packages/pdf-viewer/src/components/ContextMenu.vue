<template>
  <Teleport to="body">
    <Transition name="aix-pdf-context-menu">
      <div
        v-if="visible"
        ref="menuRef"
        class="aix-pdf-context-menu"
        :style="menuStyle"
        @contextmenu.prevent
      >
        <template v-for="item in menuItems" :key="item.id">
          <div v-if="item.divider" class="aix-pdf-context-menu__divider" />
          <div
            v-else
            class="aix-pdf-context-menu__item"
            :class="{ 'aix-pdf-context-menu__item--disabled': item.disabled }"
            @click="handleClick(item)"
          >
            <span v-if="item.icon" class="aix-pdf-context-menu__icon">
              {{ item.icon }}
            </span>
            <span class="aix-pdf-context-menu__label">{{ item.label }}</span>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import type { ContextMenuItem } from '../types';

const props = defineProps<{
  visible: boolean;
  position: { x: number; y: number };
  menuItems: ContextMenuItem[];
}>();

const emit = defineEmits<{
  (e: 'click', item: ContextMenuItem): void;
  (e: 'close'): void;
}>();

const menuRef = ref<HTMLElement | null>(null);
const adjustedPosition = ref({ x: 0, y: 0 });

const menuStyle = computed(() => ({
  left: `${adjustedPosition.value.x}px`,
  top: `${adjustedPosition.value.y}px`,
}));

/**
 * 计算菜单位置，避免超出视口
 */
function adjustMenuPosition(): void {
  const { x, y } = props.position;
  const menuWidth = 150; // 预估菜单宽度
  const menuHeight = props.menuItems.length * 36 + 8; // 预估菜单高度
  const padding = 8;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let adjustedX = x;
  let adjustedY = y;

  // 检查右边界
  if (x + menuWidth + padding > viewportWidth) {
    adjustedX = Math.max(padding, viewportWidth - menuWidth - padding);
  }

  // 检查下边界
  if (y + menuHeight + padding > viewportHeight) {
    adjustedY = Math.max(padding, viewportHeight - menuHeight - padding);
  }

  adjustedPosition.value = { x: adjustedX, y: adjustedY };
}

function handleClick(item: ContextMenuItem): void {
  if (item.disabled) return;
  emit('click', item);
}

function handleClickOutside(event: MouseEvent): void {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close');
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      adjustMenuPosition();
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    }
  },
  { immediate: true },
);

// 监听位置变化以重新计算边界
watch(
  () => props.position,
  () => {
    if (props.visible) {
      adjustMenuPosition();
    }
  },
);

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});
</script>
