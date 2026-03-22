<template>
  <li v-if="divided" class="aix-dropdown__divider" role="separator" />
  <li
    :class="[
      'aix-dropdown__item',
      { 'aix-dropdown__item--disabled': disabled },
    ]"
    role="menuitem"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled || undefined"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <slot>{{ label }}</slot>
  </li>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { DROPDOWN_INJECTION_KEY } from '../types';
import type { DropdownItemProps, DropdownItemEmits } from '../types';

defineOptions({
  name: 'AixDropdownItem',
});

const props = withDefaults(defineProps<DropdownItemProps>(), {
  disabled: false,
  divided: false,
});

const emit = defineEmits<DropdownItemEmits>();

const dropdownContext = inject(DROPDOWN_INJECTION_KEY, null);

function handleClick() {
  if (props.disabled) return;
  emit('click', props.command);
  dropdownContext?.handleItemClick(props.command);
}
</script>
