<template>
  <svg
    :width="width"
    :height="height"
    :style="{ color: color }"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="$attrs"
  >
    <path d="M13 2H11V5H13V2Z" fill="currentColor" />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M12 7C8.13401 7 5 10.134 5 14V20H2V22H22V20H19V14C19 10.134 15.866 7 12 7ZM12.5 9.72632L9.09454 15.3267H11.8182L11.1363 19.5269L14.5418 13.9266H11.8182L12.5 9.72632Z"
      fill="currentColor"
    />
    <path
      d="M3 6.41418L4.41421 4.99997L6.53553 7.12129L5.12132 8.53551L3 6.41418Z"
      fill="currentColor"
    />
    <path
      d="M19.5858 4.99997L21 6.41418L18.8787 8.53551L17.4645 7.12129L19.5858 4.99997Z"
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
  name: 'Alert',
});
</script>
