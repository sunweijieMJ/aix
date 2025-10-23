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
      d="M2 11.807V18.345L6.66667 15.7298V11.807C6.66667 8.91832 9.05448 6.57659 12 6.57659C14.9455 6.57659 17.3333 8.91832 17.3333 11.807V15.7298L22 18.345V11.807C22 6.39074 17.5228 2 12 2C6.47715 2 2 6.39074 2 11.807ZM13 13V10H11V13H13ZM13 15V18H11V15H13ZM13 23V20H11V23H13Z"
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
  name: 'DiXiaTongDao',
});
</script>
