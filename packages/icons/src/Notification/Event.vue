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
      d="M17 12H12V17H17V12ZM16 3H8V1H6V3H3C3 3 3.01 3.9 3.01 5L3 19C3 20.1 3.01 19 3.01 20.99H21C21 19 21 20.1 21 19V5C21 3.9 21 5 21 3H18V1H16V3ZM19 19H5V8H19V19Z"
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
  name: 'Event',
});
</script>
