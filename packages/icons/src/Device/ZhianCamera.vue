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
      d="M5.99389 3H15.4352V4.88826H11.679V9.44793L22 12.2134L18.9543 16.2845L14.3945 15.0627L13.1727 19.6225L4.01107 17.1677C2.5233 16.769 1.67526 15.1096 2.11694 13.4613L2.96108 10.3109C3.40276 8.66251 4.96689 7.64943 6.45466 8.04808L9.7907 8.94197V4.88826H5.99389V3ZM17.032 16.7469C17.4551 16.8602 17.7355 17.1855 17.6584 17.4733L16.9603 20.0789C16.8831 20.3667 16.4777 20.5081 16.0546 20.3947L14.0847 19.8669L15.0622 16.2191L17.032 16.7469Z"
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
  name: 'ZhianCamera',
});
</script>
