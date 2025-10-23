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
      d="M2 21H22V18H2V21ZM20.9474 8H3.05263C2.47368 8 2 8.45 2 9V15C2 15.55 2.47368 16 3.05263 16H20.9474C21.5263 16 22 15.55 22 15V9C22 8.45 21.5263 8 20.9474 8ZM2 3V6H22V3H2Z"
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
  name: 'ViewDay',
});
</script>
