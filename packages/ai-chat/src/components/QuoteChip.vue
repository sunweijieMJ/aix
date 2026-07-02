<template>
  <div :class="ns.b()">
    <button type="button" :class="ns.e('body')" @click="emit('locate', quote)">
      <span v-if="intentLabel" :class="ns.e('intent')">{{ intentLabel }}</span>
      <span :class="ns.e('text')">{{ quote.anchor.exact }}</span>
    </button>
    <button
      type="button"
      :class="ns.e('remove')"
      :aria-label="t.quoteRemove"
      :title="t.quoteRemove"
      @click="emit('remove')"
    >
      ×
    </button>
  </div>
</template>

<script lang="ts">
export interface QuoteChipProps {
  quote: Quote;
}
export interface QuoteChipEmits {
  (e: 'remove'): void;
  /** 点击主体回链定位到原文 */
  (e: 'locate', quote: Quote): void;
}
</script>

<script setup lang="ts">
import { useLocale, useNamespace } from '@aix/hooks';
import { computed } from 'vue';
import { locale } from '../locale';
import type { Quote } from '../types';

const props = defineProps<QuoteChipProps>();
const emit = defineEmits<QuoteChipEmits>();
const ns = useNamespace('quote-chip');
const { t } = useLocale(locale);

// 内置 intent 走 locale 文案；业务自定义 intent 原样展示
const intentLabel = computed(() => {
  const map: Record<string, string> = {
    explain: t.value.quoteExplain,
    ask: t.value.quoteAsk,
    translate: t.value.quoteTranslate,
  };
  return props.quote.intent ? (map[props.quote.intent] ?? props.quote.intent) : '';
});
</script>

<style lang="scss">
.aix-quote-chip {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  max-width: 260px;

  // 与「+N/收起」toggle 共用同一控件高度 token 定死等高：内部 button 不继承外层字号，
  // 依赖 padding/行高巧合对齐不可靠
  height: var(--aix-controlHeightSM);
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadiusSM);
  background-color: var(--aix-colorFillTertiary);
  font-size: var(--aix-fontSizeSM);

  &__body {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    height: 100%;
    padding: 0 var(--aix-paddingXS);
    border: none;
    background: transparent;
    color: var(--aix-colorTextSecondary);
    font: inherit;
    cursor: pointer;
    gap: var(--aix-marginXXS);
  }

  &__intent {
    flex: none;
    color: var(--aix-colorPrimary);
  }

  &__text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__remove {
    flex: none;
    height: 100%;
    padding: 0 var(--aix-paddingXXS);
    border: none;
    background: transparent;
    color: var(--aix-colorTextTertiary);
    font: inherit;
    cursor: pointer;

    &:hover {
      color: var(--aix-colorText);
    }
  }
}
</style>
