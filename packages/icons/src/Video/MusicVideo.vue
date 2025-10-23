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
      d="M1 3V21H23V3H1ZM21 19H3V5H21V19ZM8 15C8 13.34 9.34 12 11 12C11.35 12 11.69 12.07 12 12.18V6H17V8H14V15.03C13.98 16.67 12.65 18 11 18C9.34 18 8 16.66 8 15Z"
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
  name: 'MusicVideo',
});
</script>
