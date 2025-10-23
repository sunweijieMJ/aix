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
      d="M2.5 19H21.5V21H2.5V19ZM9.68 13.27L14.03 14.43L19.34 15.85C20.14 16.06 20.96 15.59 21.18 14.79C21.39 13.99 20.92 13.17 20.12 12.95L14.81 11.53L12.05 2.51L10.12 2V10.28L5.15 8.95L4.22 6.63L2.77 6.24V11.41L4.37 11.84L9.68 13.27Z"
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
  name: 'FlightLand',
});
</script>
