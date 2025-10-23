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
      d="M14 3H10V5.28988C8.93532 5.60676 7.97676 6.17014 7.19055 6.91384L5.20581 5.76795L3.20581 9.23205L5.18913 10.3771C5.06548 10.898 5.00004 11.4413 5.00004 12C5.00004 12.5587 5.06548 13.102 5.18913 13.6229L3.20581 14.7679L5.20581 18.2321L7.19055 17.0862C7.97676 17.8299 8.93532 18.3932 10 18.7101V21H14V18.7101C15.0648 18.3932 16.0233 17.8299 16.8095 17.0862L18.7943 18.2321L20.7943 14.7679L18.811 13.6229C18.9346 13.102 19 12.5587 19 12C19 11.4413 18.9346 10.898 18.811 10.3771L20.7943 9.23205L18.7943 5.76795L16.8095 6.91384C16.0233 6.17014 15.0648 5.60676 14 5.28988V3ZM15 12C15 13.6569 13.6569 15 12 15C10.3432 15 9.00004 13.6569 9.00004 12C9.00004 10.3431 10.3432 9 12 9C13.6569 9 15 10.3431 15 12Z"
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
  name: 'Setting',
});
</script>
