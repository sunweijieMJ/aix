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
      d="M17.94 17L15 15.28L12.06 17L12.84 13.67L10.25 11.43L13.66 11.14L15 8L16.34 11.14L19.75 11.43L17.16 13.67L17.94 17ZM2.01 4L2 20H22V6H12L10 4H2.01Z"
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
  name: 'FolderSpecial',
});
</script>
