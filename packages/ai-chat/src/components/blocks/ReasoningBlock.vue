<template>
  <Thinking :title="title" :expanded="isStreamingStatus">
    <MarkdownRenderer
      :content="displayContent"
      :streaming="streaming"
      :markdown-renderers="config.markdownRenderers"
      :allow-html="config.allowHtml ?? false"
      :md-plugins="config.mdPlugins"
    />
  </Thinking>
</template>

<script lang="ts">
export interface ReasoningBlockProps {
  /** reasoning 类型的 block */
  block: Extract<ContentBlock, { type: 'reasoning' }>;
  /** 气泡上下文（用于按 status 判定是否流式中） */
  info?: BubbleContentInfo;
  /** 打字机：`true` 默认节奏 / 配置对象 `{ step, interval }` / `false` 不逐字，默认 false */
  typing?: boolean | BubbleTypingConfig;
}
export interface ReasoningBlockEmits {
  /** 思考文本逐字显示完毕（追平源文本）时触发，参与 Bubble 的消息级完成聚合 */
  (e: 'typing-complete'): void;
}
</script>

<script setup lang="ts">
import { useLocale, useInterval } from '@aix/hooks';
import { computed, ref, watch } from 'vue';
import { useAiChatConfig } from '../../composables/useAiChatConfig';
import { useTypewriter } from '../../composables/useTypewriter';
import { locale } from '../../locale';
import type { ContentBlock, BubbleContentInfo, BubbleTypingConfig } from '../../types';
import MarkdownRenderer from '../MarkdownRenderer.vue';
import Thinking from '../Thinking.vue';

// 注册表统一向渲染器透传 block/info/typing；关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<ReasoningBlockProps>(), { typing: false });
const emit = defineEmits<ReasoningBlockEmits>();
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
  // 与 TextBlock 对齐：追平即上抛。否则纯 reasoning 消息永远进不了 BubbleList 的
  // completedIds，typing 常开、虚拟列表重挂载时自定义块重播
  onComplete: () => emit('typing-complete'),
});
const displayContent = computed(() => (typingEnabled.value ? displayed.value : props.block.text));

// 消息整体是否仍在流式（loading/updating）
const messageStreaming = computed(
  () => props.info?.status === 'loading' || props.info?.status === 'updating',
);

// 思考是否仍在进行：消息整体流式中，且数据层（useChat）尚未给这个 reasoning 块打上 endedAt。
// endedAt 由 useChat 在思考被顶替（转正文/工具/其它块）或消息终态落定时写入，是比「消息级
// status」更精确的信号——避免思考早已结束、但消息仍在流式输出正文时被误判为「还在思考」。
// Thinking 内部 watch expanded，用户仍可手动点击切换。
const isStreamingStatus = computed(() => messageStreaming.value && !props.block.endedAt);

// 耗时展示：起止时间戳来自数据层（props.block.startedAt/endedAt，由 useChat 打点、随消息
// 内容一起可持久化），本组件只负责思考进行中每秒刷新一次展示；历史消息 / 业务自建 block
// 没有 startedAt 时不展示耗时（title 回退为纯标题）。
const tickedAt = ref<number | null>(null);
const { start: startTicking, stop: stopTicking } = useInterval(() => {
  tickedAt.value = Date.now();
}, 1000);
watch(isStreamingStatus, (active) => (active ? startTicking() : stopTicking()), {
  immediate: true,
});

const elapsedSeconds = computed(() => {
  const start = props.block.startedAt;
  if (start == null) return null;
  const end = props.block.endedAt ?? tickedAt.value ?? Date.now();
  return Math.max(1, Math.round((end - start) / 1000));
});

const title = computed(() => {
  const base = t.value.thoughtTitle;
  return elapsedSeconds.value === null
    ? base
    : base + t.value.thoughtDurationSuffix.replace('{s}', String(elapsedSeconds.value));
});

// MarkdownRenderer 的 streaming 与 TextBlock 同款推导：消息仍在流式或打字机未追平，
// 而不是 typing 配置本身（success 后 typing 仍为 true，常开会导致末块永不固化、尾光标永闪）。
const streaming = computed(
  () => isStreamingStatus.value || (typingEnabled.value && displayed.value !== props.block.text),
);
</script>
