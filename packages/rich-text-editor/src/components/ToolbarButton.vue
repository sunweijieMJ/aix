<template>
  <button
    :class="[
      'aix-rich-text-editor__toolbar-btn',
      { 'aix-rich-text-editor__toolbar-btn--active': active },
    ]"
    :disabled="disabled"
    :title="title"
    type="button"
    @click="$emit('click')"
  >
    <component :is="icon" v-if="icon" />
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
import type { FunctionalComponent } from 'vue';

defineProps<{
  icon?: FunctionalComponent;
  title?: string;
  active?: boolean;
  disabled?: boolean;
}>();

defineEmits<{
  (e: 'click'): void;
}>();
</script>
