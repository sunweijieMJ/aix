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
      d="M8 16H16V8H8V16ZM20 16H22V8H20V16ZM22 20V18H20V20H18V22H20V24H22V22H24V20H22ZM20 6H22V2H18V4H20V6ZM2 16H4V8H2V16ZM4 18H2V22H6V20H4V18ZM2 6H4V4H6V2H2V6ZM8 22H16V20H8V22ZM8 4H16V2H8V4Z"
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
  name: 'CrossRectangle',
});
</script>
