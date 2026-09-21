<template>
  <img v-if="kind === 'url'" :class="ns.m('img')" :src="icon as string" alt="" />
  <i v-else-if="kind === 'class'" :class="[ns.m('font'), icon as string]" />
  <component :is="icon" v-else />
</template>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { computed } from 'vue';
import type { MenuIconSource } from '../types';
import { resolveMenuIconKind } from '../utils/icon';

defineOptions({
  name: 'AixMenuItemIcon',
});

/** 按图标来源渲染：图片地址为 img、字体图标类名为 i、其余为组件 */
const props = defineProps<{
  /** 图标来源 */
  icon: MenuIconSource;
}>();

const ns = useNamespace('menu-item-icon');
const kind = computed(() => resolveMenuIconKind(props.icon));
</script>
