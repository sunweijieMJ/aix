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
      d="M19 7H11V15H3V5H1V20H3V17H21V20H23V11C23 8.78998 21.21 7 19 7ZM10 11C10 12.66 8.66003 14 7 14C5.33997 14 4 12.66 4 11C4 9.34003 5.33997 8 7 8C8.66003 8 10 9.34003 10 11Z"
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
  name: 'BinLvGuan',
});
</script>
