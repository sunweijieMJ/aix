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
      d="M5.01 2.99999C5 2.99999 5.01 3.89999 5.01 4.99999L5 21L12 18L19 21V4.99999C19 3.89999 19 4.98999 19 2.98999C13.005 2.98999 5.01 2.99999 5.01 2.99999Z"
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
  name: 'Bookmark',
});
</script>
