<script setup lang="ts">
/** 插槽转发演示 */
defineProps<{ names: string[] }>();

const footer = 'footer';
</script>

<template>
  <div>
    <!-- @slot 头部，作用域给出条目数与展开态 -->
    <slot name="header" :count="names.length" :is-open="true" />
    <template v-for="n in names" :key="n">
      <slot :name="n" />
    </template>
    <slot name="footer" />
    <slot :name="footer" />
  </div>
</template>
