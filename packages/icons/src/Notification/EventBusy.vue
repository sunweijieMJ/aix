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
      d="M9.31 17L11.75 14.56L14.19 17L15.25 15.94L12.81 13.5L15.25 11.06L14.19 10L11.75 12.44L9.31 10L8.25 11.06L10.69 13.5L8.25 15.94L9.31 17ZM19 19H5V8H19V19ZM18 3V1H16V3H8V1H6V3H3L3.01 21.01H21V3H18Z"
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
  name: 'EventBusy',
});
</script>
