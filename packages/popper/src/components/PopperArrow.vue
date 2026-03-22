<template>
  <div class="aix-popper__arrow" :style="style" />
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';

defineOptions({
  name: 'AixPopperArrow',
});

defineProps<{
  style?: CSSProperties;
}>();
</script>
