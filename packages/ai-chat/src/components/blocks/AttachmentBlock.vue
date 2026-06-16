<template>
  <div v-if="block.items.length" :class="ns.b()">
    <AttachmentCard v-for="item in block.items" :key="item.id" :item="item" />
  </div>
</template>

<script lang="ts">
export interface AttachmentBlockProps {
  /** attachment 类型的 block（气泡回显附件列表） */
  block: Extract<ContentBlock, { type: 'attachment' }>;
  /** 气泡上下文（注册表统一透传，本组件暂不消费） */
  info?: BubbleContentInfo;
  /** 打字机态（注册表统一透传 boolean | 节奏配置，附件卡片不逐字，故不消费） */
  typing?: boolean | BubbleTypingConfig;
}
</script>

<script setup lang="ts">
import { useNamespace } from '@aix/hooks';
import type { ContentBlock, BubbleContentInfo, BubbleTypingConfig } from '../../types';
import AttachmentCard from '../AttachmentCard.vue';

// 注册表统一向渲染器透传 block/info/typing；本组件只消费 block，关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

defineProps<AttachmentBlockProps>();
const ns = useNamespace('attachment-block');
</script>

<style lang="scss">
.aix-attachment-block {
  display: flex;
  flex-wrap: wrap;
  gap: var(--aix-sizeXS);
}
</style>
