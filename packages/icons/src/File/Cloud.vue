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
      d="M18.7375 10.2034C18.1142 7.04091 15.3367 4.66675 12 4.66675C9.35083 4.66675 7.05917 6.17008 5.91333 8.37008C3.15417 8.66341 1 10.9917 1 13.8334C1 16.8676 3.46583 19.3334 6.5 19.3334H18.4167C20.9467 19.3334 23 17.2801 23 14.7501C23 12.3301 21.1208 10.3684 18.7375 10.2034ZM18.4167 17.5001H6.5C4.47417 17.5001 2.83333 15.8592 2.83333 13.8334C2.83333 11.8076 4.47417 10.1667 6.5 10.1667C8.52583 10.1667 10.1667 11.8076 10.1667 13.8334H12C12 11.3034 10.295 9.17675 7.96667 8.53508C8.8925 7.30675 10.35 6.50008 12 6.50008C14.7775 6.50008 17.0417 8.76425 17.0417 11.5417V12.0001H18.4167C19.9292 12.0001 21.1667 13.2376 21.1667 14.7501C21.1667 16.2626 19.9292 17.5001 18.4167 17.5001Z"
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
  name: 'Cloud',
});
</script>
