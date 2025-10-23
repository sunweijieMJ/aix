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
      d="M20 8H22V22H20V8ZM2 8H4V22H2V8ZM18 11H6V22H10V17C10 15.8954 10.8954 15 12 15C13.1046 15 14 15.8954 14 17V22H18V11ZM17 10H7C3 5 10 4 12 2C14 4 21 5 17 10ZM3.80469 7H2.19531C1.55156 5.75 2.67813 5.5 3 5C3.32187 5.5 4.44844 5.75 3.80469 7ZM21.8047 7H20.1953C19.5516 5.75 20.6781 5.5 21 5C21.3219 5.5 22.4484 5.75 21.8047 7Z"
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
  name: 'QingZhenSi',
});
</script>
