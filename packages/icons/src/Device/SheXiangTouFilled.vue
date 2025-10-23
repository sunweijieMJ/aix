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
      d="M4.95392 18H15.5V11.5H21L23 6H4.95392C3.32252 6 2 7.46525 2 9.27273V14.7273C2 16.5347 3.32252 18 4.95392 18ZM20 13.7143C20 13.3198 19.6239 13 19.16 13H17V18H19.16C19.6239 18 20 17.6802 20 17.2857V13.7143Z"
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
  name: 'SheXiangTouFilled',
});
</script>
