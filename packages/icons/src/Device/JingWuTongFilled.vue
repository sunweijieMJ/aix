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
      d="M12 0.901611L21 4.99252V11.091C21 16.605 17.2678 21.7152 12.2423 22.9703L12 23.0308L11.7577 22.9703C6.73224 21.7152 3 16.605 3 11.091V4.99252L12 0.901611ZM17.383 16.7184C16.0664 14.7077 13.6615 14.0001 11.9809 14.0001C10.3008 14.0001 7.92403 14.7073 6.61573 16.7163C7.87974 18.7654 9.78992 20.3385 12 20.9653C14.2093 20.3387 16.119 18.7664 17.383 16.7184ZM15 10.0001C15 8.34322 13.6569 7.00007 12 7.00007C10.3431 7.00007 9 8.34322 9 10.0001C9 11.6569 10.3431 13.0001 12 13.0001C13.6569 13.0001 15 11.6569 15 10.0001Z"
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
  name: 'JingWuTongFilled',
});
</script>
