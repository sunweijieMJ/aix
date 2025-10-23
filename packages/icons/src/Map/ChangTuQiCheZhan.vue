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
      d="M3 5H17L23 11V16H21C21 17.66 19.66 19 18 19C16.34 19 15 17.66 15 16H9C9 17.66 7.66003 19 6 19C4.33997 19 3 17.66 3 16H1V7C1 5.89001 1.90002 5 3 5ZM16 7H15V10H19L16 7ZM13 7H9V10H13V7ZM7 7H3V10H7V7ZM4.75 16C4.75 16.69 5.31006 17.25 6 17.25C6.68994 17.25 7.25 16.69 7.25 16C7.25 15.31 6.68994 14.75 6 14.75C5.31006 14.75 4.75 15.31 4.75 16ZM16.75 16C16.75 16.69 17.3101 17.25 18 17.25C18.6899 17.25 19.25 16.69 19.25 16C19.25 15.31 18.6899 14.75 18 14.75C17.3101 14.75 16.75 15.31 16.75 16Z"
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
  name: 'ChangTuQiCheZhan',
});
</script>
