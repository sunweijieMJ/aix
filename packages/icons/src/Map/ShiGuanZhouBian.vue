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
      d="M14 3.5L13.5 3H11.6H11V7H3V10H21V7H11.6V5.5H13L13.5 6H14.5V3.5H14ZM16 20V13H15H9H8V20H9V14H11.5V20H12.5V14H15V20H16ZM2 20H3V19H4V11H20V19H21V20H22V22H2V20Z"
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
  name: 'ShiGuanZhouBian',
});
</script>
