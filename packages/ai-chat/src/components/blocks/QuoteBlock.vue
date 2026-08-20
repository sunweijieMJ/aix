<template>
  <!-- 空 quotes 不渲染，避免显示孤立的空标题（与 SourcesBlock / AttachmentBlock 对齐） -->
  <div v-if="block.quotes.length" :class="ns.b()">
    <div :class="ns.e('title')">{{ t.quoteBlockTitle }}</div>
    <blockquote
      v-for="q in block.quotes"
      :key="q.id"
      :class="[ns.e('item'), ns.is('linkable', !!locate)]"
      :role="locate ? 'button' : undefined"
      :tabindex="locate ? 0 : undefined"
      @click="locate?.(q)"
      @keydown.enter.prevent="locate?.(q)"
      @keydown.space.prevent="locate?.(q)"
    >
      {{ q.anchor.exact }}
    </blockquote>
  </div>
</template>

<script lang="ts">
export interface QuoteBlockRendererProps {
  block: Extract<ContentBlock, { type: 'quote' }>;
  /** 气泡上下文（注册表统一透传，本组件暂不消费） */
  info?: BubbleContentInfo;
  /** 打字机态（注册表统一透传 boolean | 节奏配置，引用块不逐字，故不消费） */
  typing?: boolean | BubbleTypingConfig;
}
</script>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import { inject } from 'vue';
import { useAiChatLocale } from '../../composables/useAiChatLocale';
import { QUOTE_LOCATE_KEY } from '../../composables/useQuoteMenu';
import type { ContentBlock, BubbleContentInfo, BubbleTypingConfig } from '../../types';

// 注册表统一透传 block/info/typing，本组件只消费 block（与 AttachmentBlock 同做法）
defineOptions({ inheritAttrs: false });
defineProps<QuoteBlockRendererProps>();

const ns = useNamespace('quote-block');
const { t } = useAiChatLocale();
// AiChat 提供回链；独立使用（纯 Bubble）时为 null，条目不可点
const locate = inject(QUOTE_LOCATE_KEY, null);
</script>

<style lang="scss">
.aix-quote-block {
  margin-bottom: var(--aix-marginXXS);
  font-size: var(--aix-fontSizeSM);

  &__title {
    margin-bottom: var(--aix-marginXXS);
    color: var(--aix-colorTextTertiary);
  }

  &__item {
    margin: 0 0 var(--aix-marginXXS);
    padding: var(--aix-paddingXXS) var(--aix-paddingXS);
    border-left: 3px solid var(--aix-colorPrimaryBorder, var(--aix-colorPrimary));
    background-color: var(--aix-colorFillQuaternary, var(--aix-colorFillTertiary));
    color: var(--aix-colorTextSecondary);

    &.is-linkable {
      cursor: pointer;

      &:hover {
        background-color: var(--aix-colorFillTertiary);
      }

      // 未注入 locate 时不可聚焦，避免出现无操作的假按钮；此处仅为可聚焦态补充可见焦点环
      &:focus-visible {
        outline: 2px solid var(--aix-colorPrimary);
        outline-offset: 1px;
      }
    }
  }
}
</style>
