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
      d="M2.96704 20.1818H13.7126V22H2.96704V20.1818ZM6.7683 8.42724L9.30247 5.85724L21.9644 18.7136L19.432 21.2845L6.7683 8.42724ZM13.101 2L18.1667 7.14183L15.6325 9.71456L10.5696 4.5691L13.101 2ZM5.49673 9.71362L10.5624 14.8564L8.03001 17.4273L2.96436 12.2845L5.49673 9.71362Z"
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
  name: 'Gavel',
});
</script>
