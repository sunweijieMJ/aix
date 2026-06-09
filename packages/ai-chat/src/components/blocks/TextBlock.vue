<template>
  <MarkdownRenderer
    :content="displayContent"
    :streaming="typing"
    :markdown-renderers="config.markdownRenderers"
    :allow-html="config.allowHtml ?? false"
    :md-plugins="config.mdPlugins"
  />
</template>

<script lang="ts">
import type { ContentBlock } from '../../types';

export interface TextBlockProps {
  /** text 或 reasoning 类型的 block */
  block: Extract<ContentBlock, { type: 'text' | 'reasoning' }>;
  /** 是否启用打字机逐字显示，默认 false */
  typing?: boolean;
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import MarkdownRenderer from '../MarkdownRenderer.vue';
import { useTypewriter } from '../../composables/useTypewriter';
import { useAiChatConfig } from '../../composables/useAiChatConfig';

// 注册表统一向渲染器透传 block/info/typing；本组件只消费 block/typing，
// 关闭属性继承避免 info 等多余 attr 落到根渲染元素。
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<TextBlockProps>(), { typing: false });

// 注入 AiChat 注入的 markdown 级配置（markdownRenderers / allowHtml）透传给 MarkdownRenderer
const config = useAiChatConfig();

// 用 computed 将 block.text 包装为 Ref<string>（ComputedRef 是 Ref 子类型），
// 避免对联合类型使用 toRef 带来的麻烦
const text = computed(() => props.block.text);

// 复用既有 useTypewriter：流式持续追赶 + enabled 响应式开关均已修复
const { displayed } = useTypewriter(text, { enabled: () => props.typing });

// typing 关闭时直接取源文本，跳过打字机缓冲
const displayContent = computed(() => (props.typing ? displayed.value : props.block.text));
</script>
