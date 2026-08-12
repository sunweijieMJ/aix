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
    max-width: 100%;

    /* 用 min-height 而非写死 height：容器一窄（侧边栏 / 移动端）文案就换行，而 24px 的
       内容盒装不下两行——配合 align-items:center 会上下双向溢出到圆角描边之外。
       min-height 下单行形态逐像素不变（行盒高度小于本下限，仍由它决定），多行时按内容撑高。max-width 兜住「一条建议比容器还长」的情形。
       纵向 padding 刻意保持 0：加上去会让既有单行胶囊从 24px 变高，属无谓的视觉回归；
       想要多行更舒展的宿主自行加 padding 即可。 */
    min-height: var(--aix-controlHeightSM);
    padding: 0 var(--aix-paddingSM);
    transition: all var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorBgContainer);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);

    /* start 而非 left：换行后多行文本需要左对齐（否则会继承宿主可能设的居中），
       用逻辑属性值以免在 RTL 语境下把文字顶到错误一侧 */
    text-align: start;
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
