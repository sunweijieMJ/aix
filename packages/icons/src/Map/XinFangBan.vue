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
      d="M12.75 15.0212C12.36 15.4112 11.73 15.4112 11.34 15.0212L6.39001 10.0712C6 9.68126 6 9.05126 6.39001 8.66124L12.76 2.29125C13.15 1.90126 13.78 1.90126 14.16 2.30126L19.11 7.25124C19.5 7.64125 19.5 8.27126 19.11 8.66124L12.75 15.0212ZM18 13.0012H17.32L15.32 15.0012H17.23L19 17.0012H5L6.78 15.0012H8.82999L6.82999 13.0012H6L3 16.0012V20.0012C3 21.1012 3.89001 22.0012 4.98999 22.0012H19C20.1 22.0012 21 21.1112 21 20.0012V16.0012L18 13.0012ZM17 7.95125L13.46 4.41124L8.51001 9.36126L12.05 12.9012L17 7.95125Z"
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
  name: 'XinFangBan',
});
</script>
