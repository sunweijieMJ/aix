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
      d="M3 3V21H21V3H3ZM11 15H9.5V13H7.5V15H6V9H7.5V11.5H9.5V9H11V15ZM13 9H17C17.55 9 18 9.45 18 10V14C18 14.55 17.55 15 17 15H13V9ZM14.5 13.5H16.5V10.5H14.5V13.5Z"
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
  name: 'Hd',
});
</script>
