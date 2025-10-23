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
      d="M22 7H20V3H2V21H20V17H22V15H20V13H22V11H20V9H22V7ZM18 19H4V5H18V19ZM6 13H11V17H6V13ZM12 7H16V10H12V7ZM6 7H11V12H6V7ZM12 11H16V17H12V11Z"
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
  name: 'DeveloperBoard',
});
</script>
