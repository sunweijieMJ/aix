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
      d="M8 15V19H2V15H8ZM15 15V19H9V15H15ZM22 15V19H16V15H22ZM8 10V14H2V10H8ZM15 10V14H9V10H15ZM22 10V14H16V10H22ZM8 5V9H2V5H8ZM15 5V9H9V5H15ZM22 5V9H16V5H22Z"
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
  name: 'NineScreen',
});
</script>
