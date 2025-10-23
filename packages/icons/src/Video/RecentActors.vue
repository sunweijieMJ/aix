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
      d="M21 5V19H23V5H21ZM17 19H19V5H17V19ZM1 5V19H15V5H1ZM8 7.75C9.24 7.75 10.25 8.76 10.25 10C10.25 11.24 9.24 12.25 8 12.25C6.76 12.25 5.75 11.24 5.75 10C5.75 8.76 6.76 7.75 8 7.75ZM12.5 17H3.5V16.25C3.5 14.75 6.5 14 8 14C9.5 14 12.5 14.75 12.5 16.25V17Z"
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
  name: 'RecentActors',
});
</script>
