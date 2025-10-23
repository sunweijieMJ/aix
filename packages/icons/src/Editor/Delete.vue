<template>
  <svg
    :width="width"
    :height="height"
    :style="{ color: color }"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="$attrs"
  >
    <path d="M9 3H15V5H20V7H4V5H9V3Z" fill="currentColor" />
    <path d="M9 9H11V17H9V9Z" fill="currentColor" />
    <path d="M15 9H13V17H15V9Z" fill="currentColor" />
    <path
      d="M18.9837 9H16.9837V19.1538H7V9H5V21H18.9837V9Z"
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
  name: 'Delete',
});
</script>
