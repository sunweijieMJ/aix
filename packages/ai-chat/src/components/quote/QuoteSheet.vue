<template>
  <Teleport to="body">
    <div
      ref="floatingElRef"
      :class="ns.b()"
      :style="floatingStyles"
      role="menu"
      @keydown.esc="emit('close')"
    >
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        role="menuitem"
        :class="ns.e('btn')"
        :disabled="item.disabled"
        @click="emit('invoke', item.key)"
      >
        <component :is="item.icon" v-if="item.icon" :class="ns.e('icon')" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script lang="ts">
export interface QuoteSheetProps {
  items: ResolvedQuoteAction[];
  /** 定位锚：长按触点（视口坐标）造零尺寸 rect */
  getAnchorRect: () => DOMRect;
}
export interface QuoteSheetEmits {
  (e: 'invoke', key: string): void;
  (e: 'close'): void;
}
</script>

<script setup lang="ts">
import { useClickOutside, useNamespace } from '@aix/hooks';
import { usePopper } from '@aix/popper';
import { computed, ref, watch, watchEffect } from 'vue';
import type { ResolvedQuoteAction } from '../../types';

const props = defineProps<QuoteSheetProps>();
const emit = defineEmits<QuoteSheetEmits>();
const ns = useNamespace('quote-sheet');

const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: 'top',
  strategy: 'fixed',
  offset: 12,
});
watchEffect(() => {
  referenceRef.value = {
    getBoundingClientRect: props.getAnchorRect,
  } as unknown as HTMLElement;
});

// 桥接本地模板 ref 到 usePopper 的 floatingRef（同 QuoteToolbar.vue / TableFloatingToolbar.vue 先例）
const floatingElRef = ref<HTMLElement | null>(null);
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

// 长按菜单（trigger 驱动）无 PC 侧「选区折叠即关」的天然闭合路径，需显式点击/触摸外部关闭
useClickOutside({
  excludeRefs: computed(() => [floatingElRef.value]),
  handler: () => emit('close'),
});
</script>

<style lang="scss">
.aix-quote-sheet {
  display: flex;
  z-index: 1000;
  flex-direction: column;
  min-width: 160px;
  padding: var(--aix-paddingXXS);
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadiusLG);
  background-color: var(--aix-colorBgElevated);
  box-shadow: var(--aix-shadowLG);

  &__btn {
    display: flex;
    align-items: center;
    height: var(--aix-controlHeightLG);
    padding: 0 var(--aix-padding);
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    text-align: left;
    cursor: pointer;
    gap: var(--aix-sizeXS);

    svg {
      width: 18px;
      height: 18px;
    }

    &:active {
      background-color: var(--aix-colorFillTertiary);
    }
  }
}
</style>
