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
      d="M9.00001 11H7.00001V13H9.00001V11ZM13 11H11V13H13V11ZM17 11H15V13H17V11ZM18 4V2H16V4H8.00001V2H6.00001V4H3.01001V22H21V4H18ZM19 20H5.00001V9H19V20Z"
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
  name: 'DateRange',
});
</script>
