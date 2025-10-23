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
      d="M8 4H4V8H5.25V17H4V21H8V19.427L16 18.0937V19H20V15H18.75V8H20V4H16V5.25H8V4ZM6.75 8H8V6.75H16V8H17.25V15H16V16.573L8 17.9063V17H6.75V8Z"
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
  name: 'IconPolygon',
});
</script>
