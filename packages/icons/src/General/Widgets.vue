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
      d="M12.9648 12.8287V20.0005H20.1366V12.8287H12.9648ZM4 20.0005H11.1718V12.8287H4V20.0005ZM4 3.8639V11.0357H11.1718V3.8639H4ZM16.2459 2.68951L11.1718 7.75463L16.2459 12.8287L21.32 7.75463L16.2459 2.68951Z"
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
  name: 'Widgets',
});
</script>
