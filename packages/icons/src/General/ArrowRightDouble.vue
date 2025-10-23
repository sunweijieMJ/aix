<template>
  <svg
    :width="width"
    :height="height"
    :style="{ color: color }"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="$attrs"
  >
    <path
      d="M10.58 12L6 16.59L7.41 18L13.41 12L7.41 6L6 7.41L10.58 12Z"
      fill="currentColor"
    />
    <path
      d="M15.58 12L11 16.59L12.41 18L18.41 12L12.41 6L11 7.41L15.58 12Z"
      fill="currentColor"
    />
  </svg>
</template>

<script setup lang="ts">
interface Props {
  width?: string | number;
  height?: string | number;
  color?: string;
}

withDefaults(defineProps<Props>(), {
  width: '1em',
  height: '1em',
  color: 'currentColor',
});

defineOptions({
  name: 'ArrowRightDouble',
});
</script>
