<template>
  <Thinking :title="t.thoughtTitle" :expanded="streaming">
    <MarkdownRenderer
      :content="displayContent"
      :streaming="typingEnabled"
      :markdown-renderers="config.markdownRenderers"
      :allow-html="config.allowHtml ?? false"
      :md-plugins="config.mdPlugins"
    />
  </Thinking>
</template>

<script lang="ts">
import type { ContentBlock, BubbleContentInfo, BubbleTypingConfig } from '../../types';

export interface ReasoningBlockProps {
  /** reasoning 类型的 block */
  block: Extract<ContentBlock, { type: 'reasoning' }>;
  /** 气泡上下文（用于按 status 判定是否流式中） */
  info?: BubbleContentInfo;
  /** 打字机：`true` 默认节奏 / 配置对象 `{ step, interval }` / `false` 不逐字，默认 false */
  typing?: boolean | BubbleTypingConfig;
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { useLocale } from '@aix/hooks';
import Thinking from '../Thinking.vue';
import MarkdownRenderer from '../MarkdownRenderer.vue';
import { useTypewriter } from '../../composables/useTypewriter';
import { useAiChatConfig } from '../../composables/useAiChatConfig';
import { locale } from '../../locale';

// 注册表统一向渲染器透传 block/info/typing；关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<ReasoningBlockProps>(), { typing: false });
const { t } = useLocale(locale);
// 注入 AiChat 注入的 markdown 级配置（markdownRenderers / allowHtml）透传给 MarkdownRenderer
const config = useAiChatConfig();

// 复用 TextBlock 同款打字机：流式持续追赶 + enabled 响应式开关；typing 可为布尔或节奏配置对象
const text = computed(() => props.block.text);
const typingEnabled = computed(() => !!props.typing);
const typingOpts = computed<BubbleTypingConfig>(() =>
  typeof props.typing === 'object' ? props.typing : {},
);
const { displayed } = useTypewriter(text, {
  enabled: typingEnabled,
  step: typingOpts.value.step,
  interval: typingOpts.value.interval,
});
const displayContent = computed(() => (typingEnabled.value ? displayed.value : props.block.text));

// 流式中（loading/updating）自动展开思考过程，回复完成（success 等）后自动折叠；
// Thinking 内部 watch expanded，用户仍可手动点击切换。
const streaming = computed(
  () => props.info?.status === 'loading' || props.info?.status === 'updating',
);
</script>
