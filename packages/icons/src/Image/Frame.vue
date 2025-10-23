<template>
  <svg
    :width="width"
    :height="height"
    :style="{ color: color }"
    viewBox="0 0 24 25"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="$attrs"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M4 4.5H8V5.5H16V4.5H20V8.5H19V16.5H20V20.5H16V19.5H8V20.5H4V16.5H5V8.5H4V4.5ZM17.6 16.5H16V18.1H8V16.5H6.4V8.5H8V6.9H16V8.5H17.6V16.5Z"
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
  name: 'IconFrame',
});
</script>
