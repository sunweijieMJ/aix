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
      d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12Z"
      fill="currentColor"
    />
    <path
      d="M12 14C9.33 14 4 15.34 4 18V20H14.1547L13.2887 18.5C13.11 18.1906 13.11 17.8094 13.2887 17.5L15.0777 14.4012C13.9543 14.134 12.8442 14 12 14Z"
      fill="currentColor"
    />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M21.7113 17.5C21.89 17.8094 21.89 18.1906 21.7113 18.5L20.2887 20.9641C20.1101 21.2735 19.7799 21.4641 19.4227 21.4641H16.5774C16.2201 21.4641 15.89 21.2735 15.7113 20.9641L14.2887 18.5C14.1101 18.1906 14.1101 17.8094 14.2887 17.5L15.7113 15.0359C15.89 14.7265 16.2201 14.5359 16.5774 14.5359H19.4227C19.7799 14.5359 20.1101 14.7265 20.2887 15.0359L21.7113 17.5ZM19.5 18C19.5 18.8284 18.8284 19.5 18 19.5C17.1716 19.5 16.5 18.8284 16.5 18C16.5 17.1716 17.1716 16.5 18 16.5C18.8284 16.5 19.5 17.1716 19.5 18Z"
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
  name: 'Admin',
});
</script>
