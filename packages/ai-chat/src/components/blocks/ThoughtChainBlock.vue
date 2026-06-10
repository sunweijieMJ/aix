<template>
  <ThoughtChain :items="block.items">
    <!-- 命名约定映射：消费方在上层提供 #thought-chain-item-content，
         落到 ThoughtChain 内部的 #item-content 作用域 slot（携带 item/index）。
         用 v-if 守卫：仅当确实提供时才转发，避免凭空让 ThoughtChain.hasBody 误判为真。 -->
    <template v-if="$slots['thought-chain-item-content']" #item-content="sp">
      <slot name="thought-chain-item-content" v-bind="sp" />
    </template>
  </ThoughtChain>
</template>

<script lang="ts">
export interface ThoughtChainBlockProps {
  /** thought-chain 类型的 block */
  block: Extract<ContentBlock, { type: 'thought-chain' }>;
  /** 气泡上下文（注册表统一透传，本组件暂不消费） */
  info?: BubbleContentInfo;
  /** 是否打字机态（注册表统一透传，思维链不逐字，故不消费） */
  typing?: boolean;
}
</script>

<script setup lang="ts">
import type { ContentBlock, BubbleContentInfo } from '../../types';
import ThoughtChain from '../ThoughtChain.vue';

// 注册表统一向渲染器透传 block/info/typing；本组件只消费 block，
// 关闭属性继承避免 info/typing 落到根元素。
defineOptions({ inheritAttrs: false });

defineProps<ThoughtChainBlockProps>();
</script>
