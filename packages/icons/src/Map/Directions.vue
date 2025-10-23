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
      d="M11.6767 1.57349L21.7833 12.1801L11.6767 22.7867L1.57007 12.1801L11.6767 1.57349ZM13.5789 11.9999H9.7675V14.9999H7.86178V9.99988H13.5789V7.49988L16.9139 10.9999L13.5789 14.4999V11.9999Z"
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
  name: 'Directions',
});
</script>
