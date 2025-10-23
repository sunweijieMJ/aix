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
      d="M12 10.5C12 12.9853 14.0147 15 16.5 15C17.2322 15 17.9236 14.8251 18.5347 14.5148C17.5244 17.1384 14.9796 19 12 19C8.13401 19 5 15.866 5 12C5 8.13401 8.13401 5 12 5C13.3659 5 14.6405 5.39123 15.7177 6.06776C13.6053 6.43803 12 8.28154 12 10.5Z"
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
  name: 'Moon',
});
</script>
