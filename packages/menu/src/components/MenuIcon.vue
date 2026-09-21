<template>
  <span
    :class="ns.b()"
    :style="{ '--aix-menu-icon-src': `url(&quot;${src}&quot;)` }"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';

defineOptions({
  name: 'AixMenuIcon',
});

/** 以 mask 渲染 assets 里的 SVG，颜色跟随 currentColor */
defineProps<{
  /** SVG 资源地址（构建期内联为 data URI） */
  src: string;
}>();

const ns = useNamespace('menu-icon');
</script>
