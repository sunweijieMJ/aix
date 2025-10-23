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
      d="M18 9.77778C18 13.6779 15.6549 17.0902 12 19.6176C8.34507 17.0902 6 13.6779 6 9.77778C6 6.63954 8.63281 4 12 4C15.3672 4 18 6.63954 18 9.77778ZM20 9.77778C20 15 16.5714 19.2222 12 22C7.42857 19.2222 4 15 4 9.77778C4 5.48223 7.58172 2 12 2C16.4183 2 20 5.48223 20 9.77778ZM12 12C10.8954 12 10 11.1046 10 10C10 8.89543 10.8954 8 12 8C13.1046 8 14 8.89543 14 10C14 11.1046 13.1046 12 12 12ZM12 14C9.79086 14 8 12.2091 8 10C8 7.79086 9.79086 6 12 6C14.2091 6 16 7.79086 16 10C16 12.2091 14.2091 14 12 14Z"
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
  name: 'LocationOutline',
});
</script>
