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
      d="M1 10.0571V20H23V8.70274H21.9272V14.3514H20.6789V11.3664H19.3351V14.3514H18.175V5.48051H16.7577V10.0571H15.856V12.7403H14.5091V8.26737H13.2763V4H12V8.26737H10.8113V12.3714H9.55421V5.48051H8.25654V11.3664H6.94156V15.4051H5.96665V12.7403H4.65522V6.60952H3.41655V15.921H2.16901V10.0571H1Z"
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
  name: 'ColorScale',
});
</script>
