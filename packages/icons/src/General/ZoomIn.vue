<template>
  <svg
    :width="width"
    :height="height"
    :style="{ color: color }"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="$attrs"
  >
    <path d="M10 10V6H12V10H16V12H12V16H10V12H6V10H10Z" fill="currentColor" />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M11 2C6.041 2 2 6.041 2 11C2 15.959 6.041 20 11 20C13.1204 20 15.0729 19.2612 16.6135 18.0277L20.2426 21.6569L21.6569 20.2426L18.0277 16.6135C19.2612 15.0729 20 13.1204 20 11C20 6.041 15.959 2 11 2ZM11 18C7.14125 18 4 14.8588 4 11C4 7.14125 7.14125 4 11 4C14.8588 4 18 7.14125 18 11C18 14.8588 14.8588 18 11 18Z"
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
  name: 'ZoomIn',
});
</script>
