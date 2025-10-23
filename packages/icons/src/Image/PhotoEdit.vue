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
      d="M11 4V2H2V11H4V4H11ZM10 13L6 18H18L15 14L12.97 16.71L10 13ZM17 8.5C17 7.67 16.33 7 15.5 7C14.67 7 14 7.67 14 8.5C14 9.33 14.67 10 15.5 10C16.33 10 17 9.33 17 8.5ZM13 2V4H20V11H22V2H13ZM13 20V22H22V13H20V20H13ZM2 13V22H11V20H4V13H2Z"
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
  name: 'PhotoEdit',
});
</script>
