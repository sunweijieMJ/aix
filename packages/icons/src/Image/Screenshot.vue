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
      d="M19.9 14.4001H17.7V17.7001H14.4V19.9001H17.7V23.2001H19.9V19.9001H23.2V17.7001H19.9V14.4001ZM1.59998 18.8001C1.59998 19.4628 2.13723 20.0001 2.79998 20.0001H6.39998V17.6001H3.99998V15.2001H1.59998V18.8001ZM20 2.8001C20 2.13736 19.4627 1.6001 18.8 1.6001H15.2V4.0001H17.6V6.4001H20V2.8001ZM3.99998 4.0001H6.39998V1.6001H2.79998C2.13723 1.6001 1.59998 2.13736 1.59998 2.8001V6.4001H3.99998V4.0001ZM1.59998 8.0001H3.99998V13.6001H1.59998V8.0001ZM17.6 8.0001H20V12.0001H17.6V8.0001ZM7.99998 1.6001H13.6V4.0001H7.99998V1.6001ZM7.99998 17.6001H12V20.0001H7.99998V17.6001Z"
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
  name: 'Screenshot',
});
</script>
