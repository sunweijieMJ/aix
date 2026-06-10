<template>
  <MarkdownRenderer
    :content="displayContent"
    :streaming="streaming"
    :markdown-renderers="config.markdownRenderers"
    :allow-html="config.allowHtml ?? false"
    :md-plugins="config.mdPlugins"
  />
</template>

<script lang="ts">
export interface TextBlockProps {
  /** text 或 reasoning 类型的 block */
  block: Extract<ContentBlock, { type: 'text' | 'reasoning' }>;
  /** 气泡上下文（用于按 status 判定消息是否仍在流式） */
  info?: BubbleContentInfo;
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
import { useAiChatConfig } from '../../composables/useAiChatConfig';
import { useTypewriter } from '../../composables/useTypewriter';
import type { ContentBlock, BubbleContentInfo, BubbleTypingConfig } from '../../types';
import MarkdownRenderer from '../MarkdownRenderer.vue';

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

// streaming 反映「渲染内容是否仍可能增长」：消息仍在流式（loading/updating）或打字机未追平，
// 而不是 typing 配置本身——流式过的消息 success 后 typing 仍保持 true（BubbleList 维持打字机
// 节奏不中断），若据此常开 streaming，已完成消息的末块将永不固化（结尾代码块无高亮/复制按钮、
// mermaid 不成图）且尾光标永久闪烁；反之 typing=false 时流式期间也需要防闪烁整修。
// 历史消息重挂载时 displayed 取挂载快照（已追平），streaming 立即为 false，不影响虚拟列表场景。
const streaming = computed(
  () =>
    props.info?.status === 'loading' ||
    props.info?.status === 'updating' ||
    (typingEnabled.value && displayed.value !== props.block.text),
);
</script>
