<template>
  <Popover
    ref="popoverRef"
    trigger="click"
    placement="bottom-start"
    :arrow="false"
    :offset="4"
    popper-class="aix-rich-text-editor__toolbar-color-panel-wrapper"
  >
    <template #reference>
      <Tooltip :content="title" placement="top" :disabled="!title">
        <button :class="['aix-rich-text-editor__toolbar-btn']" :disabled="disabled" type="button">
          <component :is="icon" v-if="icon" />
          <span
            class="aix-rich-text-editor__toolbar-color-indicator"
            :style="{ backgroundColor: currentColor || 'transparent' }"
          />
        </button>
      </Tooltip>
    </template>
    <div class="aix-rich-text-editor__toolbar-color-panel">
      <button
        v-for="color in colors"
        :key="color"
        :class="[
          'aix-rich-text-editor__toolbar-color-swatch',
          {
            'aix-rich-text-editor__toolbar-color-swatch--active': color === currentColor,
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
  </Popover>
</template>

<script setup lang="ts">
import { Popover, Tooltip } from '@aix/popper';
import type { PopoverExpose } from '@aix/popper';
import { ref } from 'vue';
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

const popoverRef = ref<PopoverExpose | null>(null);

function selectColor(color: string) {
  emit('select', color);
  popoverRef.value?.hide();
}
</script>
