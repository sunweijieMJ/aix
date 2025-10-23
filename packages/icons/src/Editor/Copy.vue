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
      d="M16.5965 1.66663H5.22811C4.18601 1.66663 3.33337 2.51926 3.33337 3.56136V16.8245H5.22811V3.56136H16.5965V1.66663ZM15.6492 5.4561H9.01758C7.97548 5.4561 7.13232 6.30873 7.13232 7.35084L7.12285 20.614C7.12285 21.6561 7.96601 22.5087 9.00811 22.5087H19.4386C20.4807 22.5087 21.3334 21.6561 21.3334 20.614V11.1403L15.6492 5.4561ZM9.01758 20.614V7.35084H14.7018V12.0877H19.4386V20.614H9.01758Z"
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
  name: 'Copy',
});
</script>
