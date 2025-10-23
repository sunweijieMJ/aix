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
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M2 11C2 6.041 6.041 2 11 2C15.959 2 20 6.041 20 11C20 13.1204 19.2612 15.0729 18.0277 16.6135L21.6569 20.2426L20.2426 21.6569L16.6135 18.0277C15.0729 19.2612 13.1204 20 11 20C6.041 20 2 15.959 2 11ZM4 11C4 14.8588 7.14125 18 11 18C14.8588 18 18 14.8588 18 11C18 7.14125 14.8588 4 11 4C7.14125 4 4 7.14125 4 11ZM9 8V15L15 11L9 8Z"
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
  name: 'VideoAnalyze',
});
</script>
