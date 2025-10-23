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
      d="M1 3.01001C1 3.01001 1 3.91001 1 5.01001V9.00001H3V4.99001H21V19.02H3V15H1L1 20.98C1 20.98 1.9 20.99 3 20.99H21C22.1 20.99 23 20.98 23 20.98V3.01001C23 3.01001 22.1 3.01001 21 3.01001H1ZM11 16L15 12L11 8.00001V11H1V13H11V16Z"
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
  name: 'IconInput',
});
</script>
