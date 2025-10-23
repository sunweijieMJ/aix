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
      d="M17.66 8.0001L12 2.3501L6.34 8.0001C4.78 9.5601 4 11.6401 4 13.6401C4 15.6401 4.78 17.7501 6.34 19.3101C7.9 20.8701 9.95 21.6601 12 21.6601C14.05 21.6601 16.1 20.8701 17.66 19.3101C19.22 17.7501 20 15.6401 20 13.6401C20 11.6401 19.22 9.5601 17.66 8.0001ZM6 14.0001C6.01 12.0001 6.62 10.7301 7.76 9.6001L12 5.2701L16.24 9.6501C17.38 10.7701 17.99 12.0001 18 14.0001H6Z"
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
  name: 'Opacity',
});
</script>
