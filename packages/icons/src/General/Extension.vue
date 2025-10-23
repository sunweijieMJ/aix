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
      d="M18.9762 11.0952H17.7619V7.85714C17.7619 6.96667 17.0333 6.2381 16.1429 6.2381H12.9048V5.02381C12.9048 3.90667 11.9981 3 10.881 3C9.76381 3 8.85714 3.90667 8.85714 5.02381V6.2381H5.61905C4.72857 6.2381 4.0081 6.96667 4.0081 7.85714V10.9333H5.21429C6.42048 10.9333 7.4 11.9129 7.4 13.119C7.4 14.3252 6.42048 15.3048 5.21429 15.3048H4V18.381C4 19.2714 4.72857 20 5.61905 20H8.69524V18.7857C8.69524 17.5795 9.67476 16.6 10.881 16.6C12.0871 16.6 13.0667 17.5795 13.0667 18.7857V20H16.1429C17.0333 20 17.7619 19.2714 17.7619 18.381V15.1429H18.9762C20.0933 15.1429 21 14.2362 21 13.119C21 12.0019 20.0933 11.0952 18.9762 11.0952Z"
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
  name: 'Extension',
});
</script>
