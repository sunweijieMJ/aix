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
      d="M4 2C4 2 4 2.9 4 4V20C4 21.1 4 20 4 22H20C20 22 20 21.1 20 20V4C20 2.9 20 3.99 20 2C20 2 4 2 4 2ZM6 4H11V12L8.5 10.5L6 12V4Z"
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
  name: 'Book',
});
</script>
