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
      d="M13 12H20V13.5H13V12ZM13 9.49999H20V11H13V9.49999ZM13 14.5H20V16H13V14.5ZM23 3.99999H1C1 3.99999 1 4.89999 1 5.99999V19C1 20.1 1 19.01 1 21H21C22.1 21 21 21 23 21V3.98999C21 3.98999 22.1 3.99999 21 3.99999H23ZM21 19H12V5.99999H21V19Z"
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
  name: 'ChromeReaderMode',
});
</script>
