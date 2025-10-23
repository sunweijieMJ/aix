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
      d="M11 5H15.41L19.4399 9.03C22.03 9.23 24 11.35 24 14C24 16.8 21.8 19 19 19C16.2 19 14 16.8 14 14C14 13.37 14.11 12.77 14.3199 12.23L11.55 15H9.90002C9.44995 17.31 7.45996 19 5 19C2.19995 19 0 16.8 0 14C0 11.2 2.19995 9 5 9H16.59L14.59 7H11V5ZM10.72 13L12.72 11H8.97998C9.28003 11.39 9.52002 11.83 9.69995 12.31L9.94995 13H10.72ZM19 17C17.34 17 16 15.66 16 14C16 12.34 17.34 11 19 11C20.66 11 22 12.34 22 14C22 15.66 20.66 17 19 17ZM2 14C2 15.63 3.37 17 5 17C6.28003 17 7.40002 16.15 7.81995 15H5V13H7.81995C7.40002 11.85 6.28003 11 5 11C3.37 11 2 12.37 2 14Z"
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
  name: 'Motorcycle',
});
</script>
