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
      d="M17.42 7.20999C17.99 7.82999 18.24 8.62 18.0901 9.41L17.98 10H19.89L19.9501 9.57001C20.16 8.20999 19.6801 6.85999 18.65 5.85999L18.5801 5.79001C18.01 5.17001 17.76 4.38 17.91 3.59L18 3H16.11L16.05 3.42999C15.85 4.79001 16.3201 6.14001 17.35 7.14999L17.42 7.20999ZM5 6C5 4.89542 5.89539 4 7 4C8.10461 4 9 4.89542 9 6C9 7.10458 8.10461 8 7 8C5.89539 8 5 7.10458 5 6ZM13.42 7.20999C13.99 7.82999 14.24 8.62 14.0901 9.41L13.98 10H15.89L15.9501 9.57001C16.16 8.20999 15.6801 6.85999 14.65 5.85999L14.5801 5.79001C14.01 5.17001 13.76 4.38 13.91 3.59L14 3H12.11L12.05 3.42999C11.85 4.79001 12.3201 6.14001 13.35 7.14999L13.42 7.20999ZM11.15 12C10.84 11.78 10.5601 11.54 10.33 11.28L8.93005 9.73001C8.73999 9.51999 8.5 9.35001 8.23999 9.23001C7.94995 9.09 7.62 9 7.28003 9H7.25C6.01001 9 5 10.01 5 11.25V12H2V20C2 21.1 2.90002 22 4 22H20C21.1 22 22 21.1 22 20V12H11.15ZM5 20H7V14H5V20ZM9 20H11V14H9V20ZM15 20V14H13V20H15ZM19 20V14H17V20H19Z"
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
  name: 'XiYuZhongXin',
});
</script>
