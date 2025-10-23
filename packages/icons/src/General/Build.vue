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
      d="M21.7381 18.3471L13.4777 10.0366C14.2947 7.93617 13.8408 5.47044 12.1161 3.73529C10.3006 1.90882 7.57745 1.54353 5.39889 2.54809L9.30214 6.475L6.57894 9.2147L2.58492 5.28779C1.49564 7.47956 1.94951 10.2193 3.76497 12.0457C5.48966 13.7809 7.94054 14.2375 10.0283 13.4156L18.2887 21.726C18.6518 22.0913 19.1964 22.0913 19.5595 21.726L21.6473 19.6256C22.1012 19.2603 22.1012 18.621 21.7381 18.3471Z"
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
  name: 'Build',
});
</script>
