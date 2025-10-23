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
      d="M12.8 19.7976H20.8L14.4 4L12.8 4V19.7976ZM14.8 10.3138V17.7976H17.8319L14.8 10.3138ZM9.50005 4L3.10005 19.7976H11.1L11.1 4H9.50005ZM9.10005 17.7976H6.06819L9.10005 10.3138V17.7976Z"
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
  name: 'FlipVertical',
});
</script>
