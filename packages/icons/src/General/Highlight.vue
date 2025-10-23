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
      d="M6 14L9 17V22H15V17L18 14V9H6V14ZM11 2H13V5H11V2ZM3.5 5.875L4.914 4.46L7.034 6.582L5.62 7.997L3.5 5.875ZM16.96 6.585L19.083 4.465L20.497 5.879L18.375 8L16.96 6.585Z"
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
  name: 'Highlight',
});
</script>
