<script setup lang="ts">
/** 演示卡片 */
import type { DemoCardProps, DemoCardEmits } from './types';

withDefaults(defineProps<DemoCardProps>(), { title: 'hi', size: 'sm' });
defineEmits<DemoCardEmits>();

defineExpose({
  focus: () => {},
});
</script>

<template>
  <div>
    <slot name="header" />
    <slot />
  </div>
</template>
