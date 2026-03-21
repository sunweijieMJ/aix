<template>
  <div ref="dropdownRef" class="aix-rich-text-editor__toolbar-dropdown">
    <button
      :class="[
        'aix-rich-text-editor__toolbar-btn',
        'aix-rich-text-editor__toolbar-dropdown-trigger',
        { 'aix-rich-text-editor__toolbar-btn--active': isOpen },
      ]"
      :title="title"
      :disabled="disabled"
      type="button"
      @click="toggleOpen"
    >
      <component :is="icon" v-if="icon" />
      <span
        v-if="displayLabel"
        class="aix-rich-text-editor__toolbar-dropdown-label"
      >
        {{ displayLabel }}
      </span>
      <IconChevronDown />
    </button>
    <div v-if="isOpen" class="aix-rich-text-editor__toolbar-dropdown-menu">
      <button
        v-for="option in options"
        :key="option.value"
        :class="[
          'aix-rich-text-editor__toolbar-dropdown-item',
          {
            'aix-rich-text-editor__toolbar-dropdown-item--active':
              option.value === currentValue,
          },
        ]"
        type="button"
        @click="selectOption(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { FunctionalComponent } from 'vue';
import { IconChevronDown } from '../icons';

export interface DropdownOption {
  label: string;
  value: string;
}

const props = defineProps<{
  icon?: FunctionalComponent;
  title?: string;
  disabled?: boolean;
  options: DropdownOption[];
  currentValue?: string;
  displayLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'select', value: string): void;
}>();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

function toggleOpen() {
  isOpen.value = !isOpen.value;
}

function selectOption(value: string) {
  emit('select', value);
  isOpen.value = false;
}

// 点击外部关闭
function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
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
