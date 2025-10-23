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
      d="M7 6C7 3.79086 8.79086 2 11 2C13.2091 2 15 3.79086 15 6C15 8.20914 13.2091 10 11 10C8.79086 10 7 8.20914 7 6ZM2 16.5C2 13.508 7.996 12 11 12C11.059 12 11.1233 12.0026 11.1867 12.0052L11.2539 12.0078C10.4659 13.1398 10 14.515 10 16C10 17.075 10.2506 18.09 10.6836 19H2V16.5ZM17 11C14.2 11 12 13.2 12 16C12 18.8 14.2 21 17 21C18 21 19.0008 20.6992 19.8008 20.1992L21.5996 22L23 20.5996L21.1992 18.8008C21.6992 18.0008 22 17 22 16C22 13.2 19.8 11 17 11ZM20 16C20 14.3 18.7 13 17 13C15.3 13 14 14.3 14 16C14 17.7 15.3 19 17 19C18.7 19 20 17.7 20 16Z"
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
  name: 'SearchProfile',
});
</script>
