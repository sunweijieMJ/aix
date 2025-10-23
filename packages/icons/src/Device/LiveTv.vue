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
      d="M21 6H13.41L16.7 2.71L16 2L12 6L8 2L7.29 2.71L10.59 6H3C1.9 6 1 6.89 1 8V20C1 21.1 1.9 22 3 22H21C22.1 22 23 21.1 23 20V8C23 6.89 22.1 6 21 6ZM21 20H3V8H21V20ZM9 10V18L16 14L9 10Z"
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
  name: 'LiveTv',
});
</script>
