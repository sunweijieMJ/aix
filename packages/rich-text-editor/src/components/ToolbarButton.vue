<template>
  <Tooltip :content="title" placement="top" :disabled="!title">
    <button
      :class="[
        'aix-rich-text-editor__toolbar-btn',
        { 'aix-rich-text-editor__toolbar-btn--active': active },
      ]"
      :disabled="disabled"
      type="button"
      @click="$emit('click')"
    >
      <component :is="icon" v-if="icon" />
      <slot v-else />
    </button>
  </Tooltip>
</template>

<script setup lang="ts">
import { Tooltip } from '@aix/popper';
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
