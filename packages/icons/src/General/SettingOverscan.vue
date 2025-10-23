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
      d="M12.01 5.5L10 8H14L12.01 5.5ZM18 10V14L20.5 12.01L18 10ZM6 10L3.5 12.01L6 14V10ZM14 16H10L12.01 18.5L14 16ZM1 3C1 3 1 3.9 1 5L1 21C1 21 1.9 21 3 21H21C22.1 21 23 21 23 21V3C23 3 22.1 3 21 3H1ZM21 19.01H3V4.99H21V19.01Z"
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
  name: 'SettingOverscan',
});
</script>
