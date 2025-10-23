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
      d="M15 7.5V2H9V7.5L12 10.5L15 7.5ZM7.5 9H2V15H7.5L10.5 12L7.5 9ZM9 16.5V22H15V16.5L12 13.5L9 16.5ZM16.5 9L13.5 12L16.5 15H22V9H16.5Z"
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
  name: 'Games',
});
</script>
