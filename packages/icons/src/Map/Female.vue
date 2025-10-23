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
      d="M14 3C14 4.10457 13.1046 5 12 5C10.8955 5 10 4.10457 10 3C10 1.89543 10.8955 1 12 1C13.1046 1 14 1.89543 14 3ZM8.78623 6.71265C8.91313 6.28967 9.30245 6 9.74406 6H14.256C14.6976 6 15.0869 6.28967 15.2138 6.71265L17.6138 14.7127C17.8063 15.3543 17.3259 16 16.656 16H14V21C14 22.1046 13.1046 23 12 23C10.8955 23 10 22.1046 10 21V16H7.34406C6.6742 16 6.19375 15.3543 6.38623 14.7127L8.78623 6.71265Z"
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
  name: 'Female',
});
</script>
