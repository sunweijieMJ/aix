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
      d="M15.96 8.29L13.21 11.83L11.25 9.47L8.5 13H19.5L15.96 8.29ZM1 7V21C1 21 1.9 21 3 21H19V19H3V7H1ZM5 3V17H23V3H5ZM21 15H7V5H21V15Z"
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
  name: 'IconFilter',
});
</script>
