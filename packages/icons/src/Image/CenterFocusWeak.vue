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
      d="M3 15.0001V21.0001H9V19.0001H5V15.0001H3ZM9 5.00006V3.00006L3 2.99756V9.00006H5V5.00006H9ZM15 3.00006V5.00006H19V9.00006H21V3.00006H15ZM15 19.0001V21.0001H21V15.0001H19V19.0001H15ZM12 8.00006C9.79 8.00006 8 9.79006 8 12.0001C8 14.2101 9.79 16.0001 12 16.0001C14.21 16.0001 16 14.2101 16 12.0001C16 9.79006 14.21 8.00006 12 8.00006ZM12 14.0001C10.9 14.0001 10 13.1001 10 12.0001C10 10.9001 10.9 10.0001 12 10.0001C13.1 10.0001 14 10.9001 14 12.0001C14 13.1001 13.1 14.0001 12 14.0001Z"
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
  name: 'CenterFocusWeak',
});
</script>
