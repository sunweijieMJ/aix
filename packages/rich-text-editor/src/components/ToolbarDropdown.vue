<template>
  <Dropdown
    ref="dropdownRef"
    placement="bottom-start"
    popper-class="aix-rich-text-editor__toolbar-dropdown-menu"
  >
    <template #reference>
      <Tooltip :content="title" placement="top" :disabled="!title">
        <button
          :class="[
            'aix-rich-text-editor__toolbar-btn',
            'aix-rich-text-editor__toolbar-dropdown-trigger',
          ]"
          :disabled="disabled"
          type="button"
        >
          <component :is="icon" v-if="icon" />
          <span v-if="displayLabel" class="aix-rich-text-editor__toolbar-dropdown-label">
            {{ displayLabel }}
          </span>
          <IconChevronDown />
        </button>
      </Tooltip>
    </template>
    <template #dropdown>
      <li
        v-for="option in options"
        :key="option.value"
        :class="[
          'aix-dropdown__item',
          {
            'aix-dropdown__item--active': option.value === currentValue,
          },
        ]"
        role="menuitem"
        tabindex="0"
        @click="selectOption(option.value)"
        @keydown.enter.prevent="selectOption(option.value)"
        @keydown.space.prevent="selectOption(option.value)"
      >
        {{ option.label }}
      </li>
    </template>
  </Dropdown>
</template>

<script setup lang="ts">
import { Dropdown, Tooltip } from '@aix/popper';
import type { DropdownExpose } from '@aix/popper';
import type { FunctionalComponent } from 'vue';
import { ref } from 'vue';
import { IconChevronDown } from '../icons';
import type { DropdownOption } from '../types';

defineProps<{
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

const dropdownRef = ref<DropdownExpose | null>(null);

function selectOption(value: string) {
  emit('select', value);
  dropdownRef.value?.hide();
}
</script>
