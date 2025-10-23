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
      d="M2 5L2.01 19H22V5H2ZM11 8H13V10H11V8ZM11 11H13V13H11V11ZM8 8H10V10H8V8ZM8 11H10V13H8V11ZM7 13H5V11H7V13ZM7 10H5V8H7V10ZM16 17H8V15H16V17ZM16 13H14V11H16V13ZM16 10H14V8H16V10ZM19 13H17V11H19V13ZM19 10H17V8H19V10Z"
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
  name: 'Keyboard',
});
</script>
