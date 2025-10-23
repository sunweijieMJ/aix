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
      d="M13 2.04999V5.07999C16.39 5.56999 19 8.46999 19 12C19 12.9 18.82 13.75 18.52 14.54L21.12 16.07C21.68 14.83 22 13.45 22 12C22 6.81999 18.05 2.54999 13 2.04999ZM12 19C8.13 19 5 15.87 5 12C5 8.46999 7.61 5.56999 11 5.07999V2.04999C5.94 2.54999 2 6.80999 2 12C2 17.52 6.47 22 11.99 22C15.3 22 18.23 20.39 20.05 17.91L17.45 16.38C16.17 17.98 14.21 19 12 19Z"
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
  name: 'DataUsage',
});
</script>
