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
      d="M17.0944 16.2011C14.7341 15.3522 13.9789 14.6368 13.9789 13.1041C13.9789 12.1846 14.7002 12.485 15.0164 10.7996C15.1479 10.1014 15.7842 10.7882 15.906 9.19242C15.906 8.55717 15.5589 8.39884 15.5589 8.39884C15.5589 8.39884 15.7359 7.45837 15.8045 6.73346C15.8906 5.83115 15.2766 3.5 12.0005 3.5C8.72442 3.5 8.11039 5.83115 8.19549 6.73346C8.26511 7.45741 8.4411 8.39884 8.4411 8.39884C8.4411 8.39884 8.09396 8.55717 8.09396 9.19242C8.21579 10.7882 8.85206 10.1005 8.98356 10.7996C9.30073 12.485 10.0201 12.1846 10.0201 13.1041C10.0201 14.6359 9.26688 15.3522 6.90653 16.2011C4.53844 17.0519 3 17.9199 3 18.5113C3 19.1026 3 20.5 3 20.5H12.0005H21C21 20.5 21 19.1026 21 18.5113C21 17.9199 19.4616 17.0519 17.0944 16.2011Z"
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
  name: 'Face',
});
</script>
