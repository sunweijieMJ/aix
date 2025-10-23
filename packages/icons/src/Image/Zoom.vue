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
      d="M1.59998 11.4898C1.59998 6.04056 6.04044 1.6001 11.4897 1.6001C16.9389 1.6001 21.3793 6.04056 21.3793 11.4898C21.3793 13.8451 20.5498 16.0119 19.1677 17.7132L23.1503 21.6958L21.6957 23.1504L17.7131 19.1678C16.0118 20.5499 13.845 21.3795 11.4897 21.3795C6.04044 21.3795 1.59998 16.939 1.59998 11.4898ZM3.51998 11.5201C3.51998 15.886 7.07408 19.4401 11.44 19.4401C15.8059 19.4401 19.36 15.886 19.36 11.5201C19.36 7.1542 15.8059 3.6001 11.44 3.6001C7.07408 3.6001 3.51998 7.1542 3.51998 11.5201ZM13.04 10.4001H17.84V12.0001H13.04V10.4001ZM7.19998 10.4001H4.79998V12.0001H7.19998V14.4001H8.79998V12.0001H11.2V10.4001H8.79998V8.0001H7.19998V10.4001Z"
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
  name: 'Zoom',
});
</script>
