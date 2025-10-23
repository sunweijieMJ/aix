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
      d="M2 17H4V20H7V22H2V17ZM4 7H2V2H7V4H4V7ZM17 20H20V17H22V22H17V20ZM17 4V2H22V7H20V4H17ZM15 9C15 10.6575 13.6575 12 12 12C10.3425 12 9 10.6575 9 9C9 7.3425 10.3425 6 12 6C13.6575 6 15 7.3425 15 9ZM6 16.5C6 14.505 9.9975 13.5 12 13.5C14.0025 13.5 18 14.505 18 16.5V18H6V16.5Z"
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
  name: 'Watchlist',
});
</script>
