<template>
  <MarkdownRenderer
    :content="displayContent"
    :streaming="typingEnabled"
    :markdown-renderers="config.markdownRenderers"
    :allow-html="config.allowHtml ?? false"
    :md-plugins="config.mdPlugins"
  />
</template>

<script lang="ts">
import type { ContentBlock, BubbleTypingConfig } from '../../types';

export interface TextBlockProps {
  /** text 或 reasoning 类型的 block */
  block: Extract<ContentBlock, { type: 'text' | 'reasoning' }>;
  /** 打字机：`true` 默认节奏 / 配置对象 `{ step, interval }` / `false` 不逐字，默认 false */
  typing?: boolean | BubbleTypingConfig;
}
export interface TextBlockEmits {
  /** 当前文本逐字显示完毕（追平源文本）时触发，供上层在动画结束后再渲染操作条等 */
  (e: 'typing-complete'): void;
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
const emit = defineEmits<TextBlockEmits>();

// 注入 AiChat 注入的 markdown 级配置（markdownRenderers / allowHtml）透传给 MarkdownRenderer
const config = useAiChatConfig();

// 用 computed 将 block.text 包装为 Ref<string>（ComputedRef 是 Ref 子类型），
// 避免对联合类型使用 toRef 带来的麻烦
const text = computed(() => props.block.text);

// typing 既可为布尔也可为配置对象：布尔/对象皆视为「开启」，对象额外提供 step/interval 节奏。
const typingEnabled = computed(() => !!props.typing);
const typingOpts = computed<BubbleTypingConfig>(() =>
  typeof props.typing === 'object' ? props.typing : {},
);

// 复用既有 useTypewriter：流式持续追赶 + enabled 响应式开关；step/interval 视为静态节奏配置。
const { displayed } = useTypewriter(text, {
  enabled: typingEnabled,
  step: typingOpts.value.step,
  interval: typingOpts.value.interval,
  onComplete: () => emit('typing-complete'),
});

// typing 关闭时直接取源文本，跳过打字机缓冲
const displayContent = computed(() => (typingEnabled.value ? displayed.value : props.block.text));
</script>
