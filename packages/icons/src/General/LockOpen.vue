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
      d="M12.0001 17C13.1001 17 14.0001 16.1 14.0001 15C14.0001 13.9 13.1001 13 12.0001 13C10.9001 13 10.0001 13.9 10.0001 15C10.0001 16.1 10.9001 17 12.0001 17ZM17.0001 8V6C17.0001 3.24 14.7601 1 12.0001 1C9.24008 1 7.00008 3.24 7.00008 6H8.90008C8.90008 4.29 10.2901 2.9 12.0001 2.9C13.7101 2.9 15.1001 4.29 15.1001 6V8H4.08008L4.08008 22H20.0001V8H17.0001ZM18.0001 20H6.00008V10H18.0001V20Z"
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
  name: 'LockOpen',
});
</script>
