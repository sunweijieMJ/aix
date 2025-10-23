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
      d="M13.8259 6.39609L17.6573 2.5647L21.405 6.31236L17.5637 10.1536L17.58 10.1701L19.5 12.0901L18.09 13.5001L16.67 12.0801L7.75 21.0001H3V16.2501L11.92 7.33005L10.5 5.91005L11.91 4.50005L13.8259 6.39609ZM5 17.0801L13.06 9.02005L14.98 10.9401L6.92 19.0001L5 17.0801Z"
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
  name: 'Colorize',
});
</script>
