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
      d="M15 9H9V15H15V9ZM13 13H11V11H13V13ZM21 9H19V5H15V3H13V5H11V3H9V5H5V9H3V11H5V13H3V15H5V19H9V21H11V19H13V21H15V19H19V15H21V13H19V11H21V9ZM17 17H7V7H17V17Z"
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
  name: 'Memory',
});
</script>
