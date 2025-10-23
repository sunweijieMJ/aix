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
      d="M19 4H14.8199C14.4 2.84 13.3 2 12 2C10.7 2 9.59998 2.84 9.18005 4H5C3.90002 4 3 4.89999 3 6V20C3 21.1 3.90002 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.89999 20.1 4 19 4ZM12 3.75C12.22 3.75 12.41 3.85001 12.55 4C12.67 4.13 12.75 4.31 12.75 4.5C12.75 4.91 12.41 5.25 12 5.25C11.59 5.25 11.25 4.91 11.25 4.5C11.25 4.31 11.33 4.13 11.45 4C11.59 3.85001 11.78 3.75 12 3.75ZM5 6V20H19V6H5ZM12 7C10.35 7 9 8.35001 9 10C9 11.65 10.35 13 12 13C13.65 13 15 11.65 15 10C15 8.35001 13.65 7 12 7ZM11 10C11 10.55 11.45 11 12 11C12.55 11 13 10.55 13 10C13 9.45001 12.55 9 12 9C11.45 9 11 9.45001 11 10ZM6 17.47V19H18V17.47C18 14.97 14.03 13.89 12 13.89C9.96997 13.89 6 14.96 6 17.47ZM12 15.88C10.6901 15.88 9 16.44 8.31006 17H15.6901C15.01 16.44 13.3101 15.88 12 15.88Z"
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
  name: 'AssignmentInd',
});
</script>
