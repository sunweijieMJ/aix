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
      d="M19 16H20L22 21H2L4 16H5V17H19V16ZM14 9V6L16 3L18 6V16H14H6V9H14ZM7 11V14H9V11H7ZM11 11V14H13V11H11ZM15 8V10H17V8H15ZM15 12V14H17V12H15Z"
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
  name: 'GuangChang',
});
</script>
