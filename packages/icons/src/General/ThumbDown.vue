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
      d="M15 2H6C5.17004 2 4.45996 2.5 4.16003 3.21997L1.14001 10.27C1.05005 10.5 1 10.74 1 11V13C1 14.1 1.90002 15 3 15H9.31006L8.35999 19.57L8.32996 19.89C8.32996 20.3 8.5 20.68 8.77002 20.95L9.82996 22L16.42 15.41C16.78 15.05 17 14.55 17 14V4C17 2.90002 16.1 2 15 2ZM15 14L10.66 18.34L12 13H3V11L6 4H15V14ZM23 2H19V14H23V2Z"
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
  name: 'ThumbDown',
});
</script>
