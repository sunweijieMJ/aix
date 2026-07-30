<template>
  <nav :class="ns.b()" :aria-label="t.outlineLabel">
    <ul :class="ns.e('list')">
      <li v-for="entry in entries" :key="entry.messageId" :class="ns.e('item')">
        <button
          type="button"
          :class="[ns.e('tick'), ns.is('active', entry.messageId === activeId)]"
          :title="labelOf(entry)"
          :aria-current="entry.messageId === activeId ? 'true' : undefined"
          @click="emit('select', entry)"
        >
          <span :class="ns.e('tick-mark')" aria-hidden="true" />
          <span :class="ns.e('tick-text')">{{ labelOf(entry) }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<script lang="ts">
// OutlineEntry 由下方 setup 块 import 提供（两个 script 块共享作用域），
// 此处不重复 import 以符合 import/order（首块相对 import 会排在 setup 块的外部包之前）
export interface MessageOutlineProps {
  /** 可见刻度条目（通常传 useMessageOutline 的 windowed） */
  entries?: OutlineEntry[];
  /** 当前活跃条目的 messageId，决定高亮 */
  activeId?: string;
}

export interface MessageOutlineEmits {
  /** 点击某条刻度：宿主负责滚动定位（组件不碰滚动容器） */
  (e: 'select', entry: OutlineEntry): void;
}
</script>

<script setup lang="ts">
import { useLocale, useNamespace } from '@aix/hooks';
import type { OutlineEntry } from '../composables/useMessageOutline';
import { locale } from '../locale';

withDefaults(defineProps<MessageOutlineProps>(), { entries: () => [] });
const emit = defineEmits<MessageOutlineEmits>();

const ns = useNamespace('message-outline');
const { t } = useLocale(locale);

// 纯图片/附件消息派生不出摘要，回退到本地化文案而非留空（否则刻度只有一个光秃秃的点）
const labelOf = (entry: OutlineEntry) => entry.label || t.value.outlineUntitled;
</script>

<style lang="scss">
.aix-message-outline {
  display: flex;
  align-items: center;
  pointer-events: none;

  &__list {
    display: flex;
    flex-direction: column;
    gap: var(--aix-sizeXXS);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__item {
    display: flex;
    justify-content: flex-end;
  }

  &__tick {
    display: flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    max-width: 200px;
    padding: 2px var(--aix-paddingXXS);
    border: none;
    background: transparent;
    cursor: pointer;
    pointer-events: auto;

    /* 文本默认收起，hover/active 才展开——常态只露刻度线，不遮挡正文 */
    &:hover .aix-message-outline__tick-text,
    &.is-active .aix-message-outline__tick-text {
      max-width: 180px;
      opacity: 1;
    }

    &:hover .aix-message-outline__tick-mark,
    &.is-active .aix-message-outline__tick-mark {
      background-color: var(--aix-colorPrimary);
    }

    &:focus-visible {
      border-radius: var(--aix-borderRadiusSM);
      outline: 2px solid var(--aix-colorPrimaryBorder);
      outline-offset: 2px;
    }
  }

  &__tick-mark {
    flex: none;
    width: 14px;
    height: 3px;
    transition:
      background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      width var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border-radius: 2px;
    background-color: var(--aix-colorBorder);
  }

  &__tick-text {
    max-width: 0;
    overflow: hidden;
    transition:
      max-width var(--aix-motionDurationMid) var(--aix-motionEaseInOut),
      opacity var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    opacity: 0;
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 尊重系统「减少动态效果」设置：去掉展开过渡 */
@media (prefers-reduced-motion: reduce) {
  .aix-message-outline__tick-text,
  .aix-message-outline__tick-mark {
    transition: none;
  }
}
</style>
