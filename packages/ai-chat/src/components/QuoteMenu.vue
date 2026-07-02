<template>
  <component
    :is="skin"
    :items="items"
    :get-anchor-rect="anchorRect"
    @invoke="(key: string) => emit('invoke', key)"
    @close="emit('close')"
  />
</template>

<script lang="ts">
export interface QuoteMenuProps {
  items: ResolvedQuoteAction[];
  /** 本次触发来源 = 唯一平台事实（设计 §1）：longpress → sheet，pointer/keyboard → toolbar */
  source: 'pointer' | 'keyboard' | 'longpress';
  mode: 'menu' | 'selecting';
  /** 选区包围盒（toolbar 锚点，source=pointer/keyboard 时必传） */
  getRect?: () => DOMRect;
  /** 长按触点（sheet 锚点，source=longpress 时必传） */
  point?: { x: number; y: number };
  /** 深度换肤：仅替换单端皮肤，L2 逻辑复用 */
  toolbar?: Component;
  sheet?: Component;
}
export interface QuoteMenuEmits {
  (e: 'invoke', key: string): void;
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
