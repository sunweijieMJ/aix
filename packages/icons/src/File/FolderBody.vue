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
      d="M22 6V20H2V4H10L12 6H22ZM11.1716 8L9.17157 6H4V18H20V8H11.1716ZM8.92936 9.98373C9.52145 9.98373 10.0059 9.49995 10.0059 8.90867C10.0059 8.31738 9.52145 7.8336 8.92936 7.8336C8.33726 7.8336 7.85282 8.31738 7.85282 8.90867C7.85282 9.49995 8.33726 9.98373 8.92936 9.98373ZM10.2392 17V11.314H12.8587V10.264H5V11.314H7.61958V17H8.57449V14.3056H9.30615V17H10.2392Z"
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
  name: 'FolderBody',
});
</script>
