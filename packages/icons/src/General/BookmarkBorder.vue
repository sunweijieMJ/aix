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
      d="M5.01 3C5 3 5.01 3.9 5.01 5L5 21L12 18L19 21V5.52558C19 4.42558 19 4.42558 19 3C13.005 3 5.01 3 5.01 3ZM17 18L12 15.82L7 18V5H17V18Z"
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
  name: 'BookmarkBorder',
});
</script>
