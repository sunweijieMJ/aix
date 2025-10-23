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
      d="M3 6V3.99952L5 3L7 4.00343V6V8H3V6ZM16 7H8V8H16V7ZM16 9H8V14C8.65872 12 9.9918 11 11.9993 11C14.0067 11 15.3403 12 16 14V9ZM17 3.99952V6V8H21V6V4.00343L19 3L17 3.99952ZM7 9V21H3V9H7ZM21 21V9H17V21H21Z"
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
  name: 'TianQiao',
});
</script>
