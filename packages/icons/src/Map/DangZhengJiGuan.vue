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
      d="M5 4H14L14.4 6H20V16H13L12.6 14H7V21H5V4ZM10.5 9.75L11.9695 10.5225L11.6888 8.88627L12.8776 7.72746L11.2347 7.48873L10.5 6L9.76527 7.48873L8.12236 7.72746L9.31118 8.88627L9.03054 10.5225L10.5 9.75Z"
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
  name: 'DangZhengJiGuan',
});
</script>
