<template>
  <svg
    :width="width"
    :height="height"
    :style="{ color: color }"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="$attrs"
  >
    <g clip-path="url(#clip0_3992_8174)">
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M12 22C16.5714 19.2222 20 15 20 9.77778C20 5.48223 16.4183 2 12 2C7.58172 2 4 5.48223 4 9.77778C4 15 7.42857 19.2222 12 22ZM11.0001 13.4143L16.2072 8.20718L14.793 6.79297L11.0001 10.5859L9.20718 8.79297L7.79297 10.2072L11.0001 13.4143Z"
        fill="currentColor"
      />
    </g>
    <defs>
      <clipPath id="clip0_3992_8174">
        <rect fill="white" />
      </clipPath>
    </defs>
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
  name: 'Beenhere',
});
</script>
