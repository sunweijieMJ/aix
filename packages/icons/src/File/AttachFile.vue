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
      d="M12 22C8.96 22 6.5 19.54 6.5 16.5L6.5 6C6.5 3.79 8.29 2 10.5 2C12.71 2 14.5 3.79 14.5 6L14.5 14.5C14.5 15.88 13.38 17 12 17C10.62 17 9.5 15.88 9.5 14.5L9.5 7L11.5 7L11.5 14.59C11.5 15.14 12.5 15.14 12.5 14.59L12.5 6C12.5 4.9 11.6 4 10.5 4C9.4 4 8.5 4.9 8.5 6L8.5 16.5C8.5 18.43 10.07 20 12 20C13.93 20 15.5 18.43 15.5 16.5L15.5 7L17.5 7L17.5 16.5C17.5 19.54 15.04 22 12 22Z"
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
  name: 'AttachFile',
});
</script>
