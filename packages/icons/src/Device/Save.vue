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
      d="M3 2.99756L3 21.0001L21 20.9801C21 20.9801 21 20.1001 21 19.0001V7.00006L17 3.00006L3 2.99756ZM12 19.0001C10.34 19.0001 9 17.6601 9 16.0001C9 14.3401 10.34 13.0001 12 13.0001C13.66 13.0001 15 14.3401 15 16.0001C15 17.6601 13.66 19.0001 12 19.0001ZM15 9.00006H5V5.00006H15V9.00006Z"
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
  name: 'Save',
});
</script>
