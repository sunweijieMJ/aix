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
      d="M14 9V11H11V9H8.5V7H11V1H4V7H6.5V9H4V15H6.5V17H4V23H11V17H8.5V15H11V13H14V15H21V9H14ZM6 3H9V5H6V3ZM9 21H6V19H9V21ZM9 13H6V11H9V13ZM19 13H16V11H19V13Z"
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
  name: 'Schema',
});
</script>
