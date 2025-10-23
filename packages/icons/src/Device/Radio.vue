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
      d="M3 8.33333L3 21L21 20.9548V6.52381H7.53863L16.104 3.5019L15.492 2C15.492 2 3.42799 6.37307 3.01215 6.52381C3.01215 6.52381 3 7.58238 3 8.33333ZM7 19C5.89333 19 5 18.1067 5 17C5 15.8933 5.89333 15 7 15C8.10667 15 9 15.8933 9 17C9 18.1067 8.10667 19 7 19ZM19 13H17.25V11H15.5V13H5V9H19V13Z"
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
  name: 'Radio',
});
</script>
