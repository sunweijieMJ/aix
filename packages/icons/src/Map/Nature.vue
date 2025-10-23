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
      d="M13 16.1199C16.47 15.7099 19.17 12.7599 19.17 9.16992C19.17 5.29992 16.04 2.16992 12.17 2.16992C8.3 2.16992 5.17 5.29992 5.17 9.16992C5.17 12.6399 7.69 15.5099 11 16.0599V19.9999H5V21.9999H19V19.9999H13V16.1199Z"
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
  name: 'Nature',
});
</script>
