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
      d="M19.81 14.99L21 14.07L19.57 12.64L18.38 13.56L19.81 14.99ZM19.36 10.27L21 9L12 2L9.09 4.27L16.96 12.15L19.36 10.27ZM3.27 1L2 2.27L6.22 6.49L3 9L4.63 10.27L12 16L14.1 14.37L15.53 15.8L12 18.54L4.63 12.81L3 14.07L12 21.07L16.95 17.22L20.73 21L22 19.73L3.27 1Z"
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
  name: 'LayersClear',
});
</script>
