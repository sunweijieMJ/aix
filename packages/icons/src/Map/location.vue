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
      d="M2 5H22V7V16V18H18.5628C18.8654 17.3665 19.0382 16.6866 19.0814 16H20V7H4V16H8.23291C8.27608 16.6866 8.44896 17.3665 8.75154 18H2V16V7V5ZM16.4853 18.4853C18.0474 16.9232 18.0474 14.3905 16.4853 12.8284C14.9232 11.2663 12.3905 11.2663 10.8284 12.8284C9.26633 14.3905 9.26633 16.9232 10.8284 18.4853L13.6569 21.3137L16.4853 18.4853ZM14.6562 14.6572C15.2083 15.2093 15.2083 16.1044 14.6562 16.6565C14.1041 17.2086 13.209 17.2086 12.6569 16.6565C12.1048 16.1044 12.1048 15.2093 12.6569 14.6572C13.209 14.1051 14.1041 14.1051 14.6562 14.6572Z"
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
  name: 'Location',
});
</script>
