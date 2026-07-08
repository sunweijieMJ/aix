<template>
  <div :class="ns.b()" role="group" :aria-label="t.suggestionsLabel">
    <template v-if="loading">
      <Skeleton
        v-for="(w, i) in SKELETON_WIDTHS"
        :key="i"
        loading
        height="var(--aix-controlHeightSM)"
        :style="{ width: w, flex: 'none' }"
        :class="ns.e('skeleton-item')"
      />
    </template>
    <template v-else>
      <button
        v-for="(item, i) in items"
        :key="`${i}-${item.text}`"
        type="button"
        :class="ns.e('item')"
        @click="emit('select', item)"
      >
        <component :is="item.icon" v-if="item.icon" :class="ns.e('icon')" />
        <slot :item="item">{{ item.label ?? item.text }}</slot>
      </button>
    </template>
  </div>
</template>

<script lang="ts">
export interface SuggestionsProps {
  /** 建议项（已由上层归一化并截断） */
  items: SuggestionItem[];
  /** 建议生成中：为 true 时渲染占位胶囊，忽略 items，默认 false */
  loading?: boolean;
}
export interface SuggestionsEmits {
  (e: 'select', item: SuggestionItem): void;
}
</script>

<script setup lang="ts">
import { useLocale, useNamespace } from '@aix/hooks';
import { locale } from '../locale';
import type { SuggestionItem } from '../types';
import Skeleton from './Skeleton.vue';

defineProps<SuggestionsProps>();
const emit = defineEmits<SuggestionsEmits>();
const ns = useNamespace('suggestions');
const { t } = useLocale(locale);

/** 占位胶囊宽度（模拟长短不一的建议文案），仅 loading 态使用 */
const SKELETON_WIDTHS = ['60px', '90px', '75px'];

defineSlots<{ default?: (props: { item: SuggestionItem }) => unknown }>();
</script>

<style lang="scss">
.aix-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--aix-sizeXS);

  &__item {
    display: inline-flex;
    align-items: center;
    height: var(--aix-controlHeightSM);
    padding: 0 var(--aix-paddingSM);
    transition: all var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorBgContainer);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;
    gap: var(--aix-sizeXXS);

    &:hover {
      border-color: var(--aix-colorPrimaryHover, var(--aix-colorPrimary));
      color: var(--aix-colorPrimary);
    }
  }

  &__icon {
    display: inline-flex;

    svg {
      width: 14px;
      height: 14px;
    }
  }

  &__skeleton-item {
    border-radius: var(--aix-borderRadiusLG);
  }
}
</style>
