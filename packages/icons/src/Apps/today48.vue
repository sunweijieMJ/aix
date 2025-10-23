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
      d="M18.5 13C21.2614 13 23.5 15.2386 23.5 18C23.5 20.7614 21.2614 23 18.5 23C15.7386 23 13.5 20.7614 13.5 18C13.5 15.2386 15.7386 13 18.5 13ZM18.5 14C16.2909 14 14.5 15.7909 14.5 18C14.5 20.2091 16.2909 22 18.5 22C20.7091 22 22.5 20.2091 22.5 18C22.5 15.7909 20.7091 14 18.5 14ZM22 1L22.0004 13.1999C21.6813 12.9697 21.3385 12.7682 20.9761 12.5993L20.9756 6H2.02439V20.5L12.5669 20.5005C12.7358 20.8535 12.9392 21.1881 13.1732 21.5002L1 21.5V1H22ZM19 20V21H18V20H19ZM19 15V19H18V15H19ZM13 14.5V17.5H10V14.5H13ZM7 14.5V17.5H4V14.5H7ZM12 15.5H11V16.5H12V15.5ZM6 15.5H5V16.5H6V15.5ZM19 8.5V11.5H16V8.5H19ZM13 8.5V11.5H10V8.5H13ZM7 8.5V11.5H4V8.5H7ZM18 9.5H17V10.5H18V9.5ZM12 9.5H11V10.5H12V9.5ZM6 9.5H5V10.5H6V9.5ZM20.9756 2H2.02439V5H20.9756V2Z"
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
  name: 'Today48',
});
</script>
