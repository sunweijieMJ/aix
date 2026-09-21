<template>
  <div class="aix-popper__arrow" :style="style" />
</template>

<script setup lang="ts">
/** 浮层箭头：位置由 Popper 按定位结果算好传入，不单独使用。 */
import type { CSSProperties } from 'vue';

defineOptions({
  name: 'AixPopperArrow',
});

defineProps<{
  /** 箭头定位样式，由 Popper 按浮层位置计算后传入 */
  style?: CSSProperties;
}>();
</script>
