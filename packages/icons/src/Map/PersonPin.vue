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
      d="M3 2V20H9L12 23L15 20H21.02V2H3ZM12 5.3C13.49 5.3 14.7 6.51 14.7 8C14.7 9.49 13.49 10.7 12 10.7C10.51 10.7 9.3 9.49 9.3 8C9.3 6.51 10.51 5.3 12 5.3ZM18 16H6V15.1C6 13.1 10 12 12 12C14 12 18 13.1 18 15.1V16Z"
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
  name: 'PersonPin',
});
</script>
