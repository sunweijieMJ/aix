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
      d="M4 10V6.01246L6.44721 4.78885L5.55279 3L2 4.77639V10V12.8944V13H6V15H2V19H10L12 17L14 19H22V12.8944V10V4.77639L18.4472 3L17.5528 4.78885L20 6.01246V10H4Z"
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
  name: 'ZhiNengYanJingFilled',
});
</script>
