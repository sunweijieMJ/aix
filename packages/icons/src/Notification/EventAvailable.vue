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
      d="M16.53 12.06L15.47 11L10.59 15.88L8.47001 13.76L7.41001 14.82L10.59 18L16.53 12.06ZM18 4V2H16V4H8.00001V2H6.00001V4H3.01001V22H21V4.13334L18 4ZM19 20H5.00001V9H19V20Z"
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
  name: 'EventAvailable',
});
</script>
