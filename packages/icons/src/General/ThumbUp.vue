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
      d="M9 22H18C18.83 22 19.54 21.5 19.84 20.78L22.86 13.73C22.95 13.5 23 13.26 23 13V11C23 9.90002 22.1 9 21 9H14.6899L15.64 4.42999L15.67 4.10999C15.67 3.70001 15.5 3.32001 15.23 3.04999L14.17 2L7.57996 8.59003C7.21997 8.95001 7 9.45001 7 10V20C7 21.1 7.90002 22 9 22ZM9 10L13.34 5.65997L12 11H21V13L18 20H9V10ZM5 10H1V22H5V10Z"
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
  name: 'ThumbUp',
});
</script>
