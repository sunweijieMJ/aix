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
      d="M22 20V6H12L10 4H2V20H22ZM9.17157 6L11.1716 8H20V18H4V6H9.17157ZM9 15.5H10.5192L13.4061 12.6132L11.8868 11.0939L9 13.9808V15.5ZM12.5939 10.3868L14.1132 11.9061L15 11.0192L13.4808 9.5L12.5939 10.3868Z"
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
  name: 'FolderEdit',
});
</script>
