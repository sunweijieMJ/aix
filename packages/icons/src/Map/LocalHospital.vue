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
      d="M3.01001 3C3.01001 3 3.01001 3.9 3.01001 5L3.01001 20.94C3.01001 20.94 3.90001 21 5.00001 21H19C20.1 21 21 20.94 21 20.94V3C21 3 20.1 3 19 3H3.01001ZM18 14H14V18H10V14H6.00001V10H10V6H14V10H18V14Z"
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
  name: 'LocalHospital',
});
</script>
