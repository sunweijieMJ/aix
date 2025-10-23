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
      d="M22 13H14V11H22V13ZM22 7H14V9H22V7ZM14 17H22V15H14V17ZM12 17H2L2 7L12 7.1V17ZM10.5 15L8.25 12L6.5 14.26L5.25 12.75L3.5 15H10.5Z"
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
  name: 'ArtTrack',
});
</script>
