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
      d="M17 7H19C20.1 7 21 7.90002 21 9V21C21 22.1 20.1 23 19 23H5C3.90002 23 3 22.1 3 21V9C3 7.90002 3.90002 7 5 7H7C7 4.23999 9.23999 2 12 2C14.76 2 17 4.23999 17 7ZM15 7C15 5.34003 13.66 4 12 4C10.34 4 9 5.34003 9 7H15ZM12 13C10.34 13 9 11.66 9 10H7C7 12.76 9.23999 15 12 15C14.76 15 17 12.76 17 10H15C15 11.66 13.66 13 12 13Z"
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
  name: 'ShangChang',
});
</script>
