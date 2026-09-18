<template>
  <div class="aix-popper__arrow" :style="style" />
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';

defineOptions({
  name: 'AixPopperArrow',
});

defineProps<{
  /** 箭头定位样式，由 Popper 按浮层位置计算后传入 */
  style?: CSSProperties;
}>();
</script>
