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
      d="M16.5 8.85182L15.1474 7.5L12.0005 10.6482L8.85263 7.5L7.5 8.85182L10.6478 12L7.5 15.1482L8.85263 16.5L12.0005 13.3528L15.1474 16.5L16.5 15.1482L13.3522 12L16.5 8.85182Z"
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
  name: 'CloseSmall',
});
</script>
