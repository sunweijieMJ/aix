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
      d="M12 6H22V20H2V4H10L12 6ZM11.1716 8L9.17157 6H4V18H20V8H11.1716ZM9.5 9.5C10.4669 9.5 11.25 10.2831 11.25 11.25C11.25 12.2169 10.4669 13 9.5 13C8.53312 13 7.75 12.2169 7.75 11.25C7.75 10.2831 8.53312 9.5 9.5 9.5ZM6 16.5V15.625C6 14.4613 8.33187 13.875 9.5 13.875C10.6681 13.875 13 14.4613 13 15.625V16.5H6Z"
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
  name: 'FolderFace',
});
</script>
