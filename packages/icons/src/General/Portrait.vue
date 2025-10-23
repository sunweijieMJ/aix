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
      d="M12 12C13.3778 12 14.5 10.8778 14.5 9.5C14.5 8.12222 13.3778 7 12 7C10.6222 7 9.5 8.12222 9.5 9.5C9.5 10.8778 10.6222 12 12 12ZM17 16C17 14 13.6667 13 12 13C10.3333 13 7 14 7 16V17H17V16ZM3 3L3 21H21V3H3ZM19 19H5V5H19V19Z"
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
  name: 'Portrait',
});
</script>
