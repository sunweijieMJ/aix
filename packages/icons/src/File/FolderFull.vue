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
      d="M23 11H20.6667L23 4H11L10.5 5.5L9 4H2V20H20L23 11ZM8.66667 11L9.79289 7.62132L8.17157 6H4V14L5 11H8.66667ZM12.4416 6H20.2252L18.5585 11H10.7749L12.4416 6Z"
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
  name: 'FolderFull',
});
</script>
