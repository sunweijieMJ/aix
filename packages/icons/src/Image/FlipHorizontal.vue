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
      d="M19.8488 11.0488V3.04883L4.05115 9.44883V11.0488H19.8488ZM10.365 9.04883H17.8488V6.01697L10.365 9.04883ZM4.05115 14.3488L19.8488 20.7488V12.7488H4.05115V14.3488ZM17.8488 14.7488V17.7807L10.365 14.7488H17.8488Z"
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
  name: 'FlipHorizontal',
});
</script>
