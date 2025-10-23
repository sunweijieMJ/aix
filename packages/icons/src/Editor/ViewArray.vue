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
      d="M3.5 5.5H6.5V18.5H3.5V5.5ZM16.5 5.5H7.5V18.5H16.5V5.5ZM17.5 5.5H20.5V18.5H17.5V5.5ZM14.5 16.5V7.5H9.5V16.5H14.5Z"
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
  name: 'ViewArray',
});
</script>
