<template>
  <div ref="pickerRef" class="aix-rich-text-editor__toolbar-color-picker">
    <button
      :class="[
        'aix-rich-text-editor__toolbar-btn',
        { 'aix-rich-text-editor__toolbar-btn--active': isOpen },
      ]"
      :title="title"
      :disabled="disabled"
      type="button"
      @click="toggleOpen"
    >
      <component :is="icon" v-if="icon" />
      <span
        class="aix-rich-text-editor__toolbar-color-indicator"
        :style="{ backgroundColor: currentColor || 'transparent' }"
      />
    </button>
    <div v-if="isOpen" class="aix-rich-text-editor__toolbar-color-panel">
      <button
        v-for="color in colors"
        :key="color"
        :class="[
          'aix-rich-text-editor__toolbar-color-swatch',
          {
            'aix-rich-text-editor__toolbar-color-swatch--active':
              color === currentColor,
          },
        ]"
        :style="{ backgroundColor: color }"
        :title="color"
        type="button"
        @click="selectColor(color)"
      />
      <button
        class="aix-rich-text-editor__toolbar-color-swatch aix-rich-text-editor__toolbar-color-swatch--clear"
        :title="clearLabel"
        type="button"
        @click="selectColor('')"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { FunctionalComponent } from 'vue';

defineProps<{
  icon?: FunctionalComponent;
  title?: string;
  disabled?: boolean;
  currentColor?: string;
  clearLabel?: string;
  colors?: string[];
}>();

const emit = defineEmits<{
  (e: 'select', color: string): void;
}>();

const isOpen = ref(false);
const pickerRef = ref<HTMLElement | null>(null);

function toggleOpen() {
  isOpen.value = !isOpen.value;
}

function selectColor(color: string) {
  emit('select', color);
  isOpen.value = false;
}

function handleClickOutside(event: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>
