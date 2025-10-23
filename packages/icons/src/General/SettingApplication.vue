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
      d="M3 3L3 20.99L21 20.98V3.01L3 3ZM10.2435 5H13.3305V6.76722C14.1522 7.01177 14.8919 7.44656 15.4987 8.02051L17.0304 7.13617L18.5739 9.8096L17.0433 10.6933C17.1387 11.0953 17.1892 11.5146 17.1892 11.9458C17.1892 12.3769 17.1387 12.7963 17.0433 13.1982L18.5739 14.0819L17.0304 16.7554L15.4987 15.871C14.8919 16.445 14.1522 16.8798 13.3305 17.1243V18.8915H10.2435V17.1243C9.42176 16.8798 8.68199 16.445 8.07523 15.871L6.5435 16.7554L5 14.0819L6.53063 13.1982C6.43521 12.7963 6.3847 12.3769 6.3847 11.9458C6.3847 11.5146 6.43521 11.0953 6.53063 10.6933L5 9.8096L6.5435 7.13617L8.07523 8.02051C8.68199 7.44656 9.42176 7.01177 10.2435 6.76722V5ZM11.8153 13.6305C12.8178 13.6305 13.6305 12.8178 13.6305 11.8153C13.6305 10.8127 12.8178 10 11.8153 10C10.8127 10 10 10.8127 10 11.8153C10 12.8178 10.8127 13.6305 11.8153 13.6305Z"
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
  name: 'SettingApplication',
});
</script>
