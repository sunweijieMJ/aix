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
      d="M1 4V18H10.2949C9.96692 16.9 9.89073 15.6906 10.1777 14.4316C10.7917 11.7356 13.0065 9.59528 15.7285 9.11328C17.6995 8.76428 19.549 9.24677 21 10.2598V4H1ZM17 11C14.2 11 12 13.2 12 16C12 18.8 14.2 21 17 21C18 21 19.0008 20.6992 19.8008 20.1992L21.5996 22L23 20.5996L21.1992 18.8008C21.6992 18.0008 22 17 22 16C22 13.2 19.8 11 17 11ZM20 16C20 14.3 18.7 13 17 13C15.3 13 14 14.3 14 16C14 17.7 15.3 19 17 19C18.7 19 20 17.7 20 16Z"
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
  name: 'SearchSnap',
});
</script>
