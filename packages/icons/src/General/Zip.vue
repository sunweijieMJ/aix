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
      d="M10.9987 16.1667H7.33203V15.4167L9.4987 12.1667H7.58203V11.1667H10.9987V11.9167L8.83203 15.1667H10.9987V16.1667Z"
      fill="currentColor"
    />
    <path
      d="M12.9987 16.1667H11.832V11.1667H12.9987V16.1667Z"
      fill="currentColor"
    />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M15.332 16.1667H14.1654V11.25H15.9154C16.9987 11.25 17.9154 11.5833 17.9154 12.8333C17.9154 14 16.9987 14.5 15.9154 14.5H15.332V16.1667ZM15.332 12.1667V13.5833H15.9154C16.4987 13.5833 16.7487 13.3333 16.7487 12.8333C16.7487 12.3333 16.4154 12.1667 15.832 12.1667H15.332Z"
      fill="currentColor"
    />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M18.6667 22C19.5833 22 20.3333 21.25 20.3333 20.3333V18.6667C21.25 18.6667 22 17.9167 22 17V10.3333C22 9.41667 21.25 8.66667 20.3333 8.66667V7.66667C20.3333 7.25 20.1667 6.83333 19.8333 6.5L15.8333 2.5C15.5833 2.16667 15.1667 2 14.6667 2H5.33333C4.41667 2 3.66667 2.75 3.66667 3.66667V8.66667C2.75 8.66667 2 9.41667 2 10.3333V17C2 17.9167 2.75 18.6667 3.66667 18.6667V20.3333C3.66667 21.25 4.41667 22 5.33333 22H18.6667ZM18.6667 8.66667H5.33333V3.66667H14.5C14.5833 3.75 14.8333 4 15.0833 4.33333C16.2499 5.41659 18.333 7.49971 18.6666 7.83326L18.6667 8.66667ZM5.33333 20.3333V18.6667H18.6667V20.3333H5.33333ZM20.3333 17H3.66667V10.3333H20.3333V17Z"
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
  name: 'Zip',
});
</script>
