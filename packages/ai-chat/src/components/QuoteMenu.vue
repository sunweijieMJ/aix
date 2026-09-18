<template>
  <component
    :is="skin"
    :items="items"
    :get-anchor-rect="anchorRect"
    :context-el="contextEl"
    @invoke="(key: string) => emit('invoke', key)"
    @close="emit('close')"
  />
</template>

<script lang="ts">
export interface QuoteMenuProps {
  /** 菜单动作列表（已解析为可直接渲染的项） */
  items: ResolvedQuoteAction[];
  /** 本次触发来源 = 唯一平台事实：longpress → sheet，pointer/keyboard → toolbar */
  source: 'pointer' | 'keyboard' | 'longpress';
  /** 'menu' 显示动作菜单；'selecting' 表示选区仍在调整中 */
  mode: 'menu' | 'selecting';
  /** 选区包围盒（toolbar 锚点，source=pointer/keyboard 时必传） */
  getRect?: () => DOMRect;
  /** 长按触点（sheet 锚点，source=longpress 时必传） */
  point?: { x: number; y: number };
  /** 虚拟锚点宿主元素（透传给皮肤的 contextEl）：供 autoUpdate 挂滚动祖先监听 */
  contextEl?: HTMLElement | null;
  /** 深度换肤：仅替换单端皮肤，L2 逻辑复用 */
  toolbar?: Component;
  /** 深度换肤：替换 sheet（长按）端皮肤 */
  sheet?: Component;
}
export interface QuoteMenuEmits {
  /** 点击某个动作，参数为动作 key */
  (e: 'invoke', key: string): void;
  /** 关闭菜单 */
  (e: 'close'): void;
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import type { ResolvedQuoteAction } from '../types';
import QuoteSheet from './quote/QuoteSheet.vue';
import QuoteToolbar from './quote/QuoteToolbar.vue';

const props = defineProps<QuoteMenuProps>();
const emit = defineEmits<QuoteMenuEmits>();

const skin = computed<Component>(() =>
  props.source === 'longpress' ? (props.sheet ?? QuoteSheet) : (props.toolbar ?? QuoteToolbar),
);

// 统一两种锚点为 getAnchorRect：触点造零尺寸 rect（同 popper createVirtualElement 先例）
const anchorRect = computed<() => DOMRect>(() => {
  if (props.source === 'longpress') {
    const { x, y } = props.point ?? { x: 0, y: 0 };
    return () => new DOMRect(x, y, 0, 0);
  }
  return props.getRect ?? (() => new DOMRect(0, 0, 0, 0));
});
</script>
