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
      d="M22 6V20H2V4H10L12 6H22ZM11.1716 8L9.17157 6H4V18H20V8H11.1716ZM13.5557 15.687L12.0425 14.1738L10.4868 15.7294L9.29889 14.5415L10.8545 12.9859L9.31303 11.4444L10.4444 10.313L11.9859 11.8545L13.5415 10.2989L14.7295 11.4868L13.1738 13.0424L14.687 14.5556L13.5557 15.687Z"
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
  name: 'FolderDelete',
});
</script>
