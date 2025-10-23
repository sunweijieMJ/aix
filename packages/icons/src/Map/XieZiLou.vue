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
      d="M11 19V5V2L20 3.5V4V5V7V9V11V13V15V17V19V21H22V22H2V21H4V19V17V15V13V11V9V8V7L10 5V9V19V21H11V19ZM19 19V17H16V19H19ZM19 15V13H16V15H19ZM19 11V9H16V11H19ZM19 7V5H16V7H19ZM7 19H5V17H7V19ZM7 15H5V13H7V15ZM7 11H5V9H7V11Z"
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
  name: 'XieZiLou',
});
</script>
