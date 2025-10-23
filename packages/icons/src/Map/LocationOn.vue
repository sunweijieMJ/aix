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
      d="M20 9.77778C20 15 16.5714 19.2222 12 22C7.42857 19.2222 4 15 4 9.77778C4 5.48223 7.58172 2 12 2C16.4183 2 20 5.48223 20 9.77778ZM8.8 9.77778C8.8 11.496 10.2327 12.8889 12 12.8889C13.7673 12.8889 15.2 11.496 15.2 9.77778C15.2 8.05956 13.7673 6.66667 12 6.66667C10.2327 6.66667 8.8 8.05956 8.8 9.77778Z"
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
  name: 'LocationOn',
});
</script>
