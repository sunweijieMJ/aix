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
      d="M22.211 19.0681L16 17.4039V15.7387H22V3.73872H6V5.73872H2V13.7387H6V15.7387H13V18.6641L13.0017 18.6643L13 18.6706L21.6933 21L22.211 19.0681ZM8 13.7387V5.73872H20V13.7387H8ZM6 11.7387H4V7.73872H6V11.7387ZM18 7.73872H10V9.73872H18V7.73872Z"
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
  name: 'Camera1',
});
</script>
