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
      d="M3 5C2.44772 5 2 5.44772 2 6V14C2 14.5523 2.44772 15 3 15C3.55228 15 4 14.5523 4 14V7H15C15.5523 7 16 6.55228 16 6C16 5.44772 15.5523 5 15 5H3ZM5.875 8H18.125C18.6082 8 19 8.3731 19 8.83333V17.1667C19 17.6269 18.6082 18 18.125 18H5.875C5.39175 18 5 17.6269 5 17.1667V8.83333C5 8.3731 5.39175 8 5.875 8ZM23 17V9L20 10.3333V15.6667L23 17Z"
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
  name: 'ZhuaPaiPingTaiFilled',
});
</script>
