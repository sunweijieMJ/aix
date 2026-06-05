<template>
  <div :class="[ns.b(), ns.is('actions-hover', actionsTrigger === 'hover')]">
    <div :class="ns.e('body')">
      <Welcome v-if="messages.length === 0" :title="welcomeTitle" :description="welcomeDescription">
        <template v-if="prompts?.length || $slots['welcome-extra']" #extra>
          <Prompts v-if="prompts?.length" :items="prompts" @select="onPromptSelect" />
          <slot name="welcome-extra" />
        </template>
      </Welcome>
      <BubbleList
        v-else
        :items="parsedMessages"
        :roles="roles"
        :should-follow="shouldFollow"
        :typing="config.enableTyping"
        :block-renderers="blockRenderers"
        :editable="editable"
        @retry="onReload"
        @block-action="onBlockAction"
        @edit="onEditMessage"
      >
        <!-- 透传气泡内容作用域 slot：使用方提供时覆盖默认 Markdown 渲染 -->
        <template v-if="$slots.content" #content="slotProps">
          <slot name="content" v-bind="slotProps" />
        </template>
        <!-- 消息操作：默认为 AI 成功回复挂载「复制 / 重新生成」，可用 #footer slot 覆盖、
             或 :show-actions="false" 关闭。仅在需要时提供 footer slot，避免空 footer 节点。 -->
        <template v-if="showActions || $slots.footer" #footer="{ item }">
          <slot name="footer" :item="item">
            <BubbleActions
              v-if="item.role === 'ai' && item.status === 'success'"
              :content="messageText(item)"
              :feedbackable="feedbackable"
              :feedback="(item.extra?.feedback as MessageFeedback | null) ?? null"
              @copy="emit('copy', item)"
              @regenerate="onReload(item.id)"
              @feedback="onFeedback(item.id, $event)"
            />
          </slot>
        </template>
        <!-- 透传块插槽：把非保留具名插槽（约定 <块类型>-<内部slot>）逐层下传，
             经 BubbleList → Bubble 最终落到块渲染器内部 slot。 -->
        <template v-for="name in blockSlotNames" :key="name" #[name]="sp">
          <slot :name="name" v-bind="sp" />
        </template>
      </BubbleList>
    </div>
    <Sender
      ref="senderRef"
      v-model="inputModel"
      :class="ns.e('sender')"
      :loading="isLoading"
      :placeholder="placeholder"
      @submit="onSend"
      @cancel="abort"
    />
  </div>
</template>

<script lang="ts">
import type { UseChatOptions } from '../composables/useChat';
import type { ShouldFollow } from '../composables/useAutoScroll';
import type {
  ChatMessage,
  RoleConfig,
  PromptItem,
  BlockRenderers,
  BlockActionPayload,
  MessageFeedback,
} from '../types';
import type { MarkdownRenderers } from '../utils/markdownWalker';

export interface AiChatProps {
  /** 发起请求，返回字节流或 Response（必填）；透传给 useChat */
  request: UseChatOptions['request'];
  /** 单行流数据 → 增量解析器，默认扁平 SSE；对接 OpenAI 可传 openaiParseChunk。透传给 useChat */
  parseChunk?: UseChatOptions['parseChunk'];
  /** 渲染消息转换器（解耦后端格式与展示形状，1→1，须保留消息 id）；透传给 useChat */
  parser?: UseChatOptions['parser'];
  /** 初始历史消息 */
  defaultMessages?: UseChatOptions['defaultMessages'];
  /** 角色气泡样式映射，优先级高于 provideAiChatConfig 的全局 roles */
  roles?: Record<string, RoleConfig>;
  /** 滚动跟随策略，优先级高于 provideAiChatConfig 的全局 shouldFollow */
  shouldFollow?: ShouldFollow;
  /** 块渲染器注册表（扩展/覆盖内置 text/reasoning 渲染），优先级高于 provideAiChatConfig 的全局 blockRenderers */
  blockRenderers?: BlockRenderers;
  /** 欢迎页快捷问题，点击后以其 label 作为消息自动发送 */
  prompts?: PromptItem[];
  /** 欢迎页标题（空消息态展示） */
  welcomeTitle?: string;
  /** 欢迎页描述文案（空消息态展示） */
  welcomeDescription?: string;
  /** 输入框占位提示，缺省取 locale.senderPlaceholder */
  placeholder?: string;
  /** 是否为 AI 成功回复挂载默认消息操作（复制 / 重新生成），默认 true；可用 #footer slot 自定义 */
  showActions?: boolean;
  /** 消息操作的显示时机：'always' 常驻显示（默认），'hover' 仅悬浮气泡或键盘聚焦内部按钮时显示（触屏设备始终显示） */
  actionsTrigger?: 'always' | 'hover';
  /** 是否允许用户消息内联编辑重发，默认 false */
  editable?: boolean;
  /** 是否为 AI 成功回复挂载赞/踩反馈按钮，默认 false */
  feedbackable?: boolean;
  /** 请求失败自动重试次数（不含首次），默认 0；透传给 useChat。abort 不触发重试 */
  retryTimes?: UseChatOptions['retryTimes'];
  /** 两次重试间隔（ms），默认 1000；透传给 useChat */
  retryInterval?: UseChatOptions['retryInterval'];
  /** markdown token 渲染器注册表（扩展/覆盖气泡内 markdown 块渲染），优先级高于全局 markdownRenderers */
  markdownRenderers?: MarkdownRenderers;
  /** 是否允许渲染原始 HTML（经 DOMPurify 消毒），默认 false；注入到气泡内 MarkdownRenderer */
  allowHtml?: boolean;
}
export interface AiChatEmits {
  /** 用户发送消息（含点击快捷问题），携带文本 */
  (e: 'send', text: string): void;
  /** 单条 AI 回复成功完成，携带该消息 */
  (e: 'finish', message: ChatMessage): void;
  /** 请求出错，携带该消息 */
  (e: 'error', message: ChatMessage): void;
  /** 被中断，携带该消息 */
  (e: 'abort', message: ChatMessage): void;
  /** 复制某条 AI 回复（默认操作触发），携带该消息 */
  (e: 'copy', message: ChatMessage): void;
  /** 交互块动作上抛（如单选作答 / 编辑保存），供业务方做持久化 / 判分 */
  (e: 'block-action', payload: BlockActionPayload): void;
  /** 用户消息编辑保存（已截断后续并重新生成），携带 id 与新文本 */
  (e: 'edit', payload: { id: string; text: string }): void;
  /** AI 回复赞/踩反馈变化，携带 id 与值（null 取消），供业务持久化 */
  (e: 'feedback', payload: { id: string; value: MessageFeedback | null }): void;
}
</script>

<script setup lang="ts">
import { computed, ref, watch, useSlots } from 'vue';
import Welcome from './Welcome.vue';
import BubbleList from './BubbleList.vue';
import Sender from './Sender.vue';
import Prompts from './Prompts.vue';
import BubbleActions from './BubbleActions.vue';
import { messageText } from '../utils/helpers';
import { useChat } from '../composables/useChat';
import { useNamespace } from '../composables/useNamespace';
import { useAiChatConfig, provideAiChatConfig } from '../composables/useAiChatConfig';

const props = withDefaults(defineProps<AiChatProps>(), {
  showActions: true,
  actionsTrigger: 'always',
});
const emit = defineEmits<AiChatEmits>();
const ns = useNamespace('ai-chat');
const config = useAiChatConfig();
const slots = useSlots();

// AiChat 自身消费 welcome-extra/content/footer；其余具名插槽透传给 BubbleList（最终落到块渲染器内部 slot）。
const AICHAT_RESERVED_SLOTS = ['welcome-extra', 'content', 'footer'];
const blockSlotNames = computed(() =>
  Object.keys(slots).filter((n) => !AICHAT_RESERVED_SLOTS.includes(n)),
);

// 受控模式：父组件可用 v-model:messages 接管消息列表（持久化 / 外部清空 / 跨组件共享）。
const messagesModel = defineModel<ChatMessage[]>('messages', { default: () => [] });
// 输入框文本受控：v-model:input 支持外部回填 / 发送失败保留 / 草稿持久化。
const inputModel = defineModel<string>('input', { default: '' });
const senderRef = ref<InstanceType<typeof Sender> | null>(null);

const DEFAULT_ROLES: Record<string, RoleConfig> = {
  user: { placement: 'end', variant: 'filled' },
  ai: { placement: 'start', variant: 'filled' },
};

// 合并优先级：内置默认 < 全局 provideAiChatConfig.roles < 组件 props.roles
const roles = computed<Record<string, RoleConfig>>(() => ({
  ...DEFAULT_ROLES,
  ...config.value.roles,
  ...props.roles,
}));

// 滚动跟随策略覆盖优先级：组件 props.shouldFollow > 全局 provideAiChatConfig.shouldFollow
// （均未提供时传 undefined，由 BubbleList/useAutoScroll 回退内置 defaultShouldFollow）
const shouldFollow = computed(() => props.shouldFollow ?? config.value.shouldFollow);

// 块渲染器合并优先级：组件 props.blockRenderers > 全局 provideAiChatConfig.blockRenderers
// （Bubble 内部再叠加内置 text/reasoning 默认渲染器）
const blockRenderers = computed<BlockRenderers>(() => ({
  ...config.value.blockRenderers,
  ...props.blockRenderers,
}));

// markdown 级配置（markdownRenderers / allowHtml）经"全局 + 组件 props"合并后重新 provide 给子树，
// 供气泡内深层的 TextBlock / ReasoningBlock 的 MarkdownRenderer 注入消费。
// 优先级：内置默认 < 全局 provideAiChatConfig < 组件 props（与 roles/blockRenderers 一致）。
// 注：markdownRenderers / allowHtml 视为相对静态配置，此处取 setup 时快照。
provideAiChatConfig({
  ...config.value,
  markdownRenderers: { ...config.value.markdownRenderers, ...props.markdownRenderers },
  allowHtml: props.allowHtml ?? config.value.allowHtml ?? false,
});

const {
  messages,
  parsedMessages,
  isLoading,
  onSend: sendMessage,
  onReload,
  onEdit,
  abort,
  setMessages,
  updateBlock,
  setFeedback,
} = useChat({
  request: props.request,
  parseChunk: props.parseChunk,
  parser: props.parser,
  defaultMessages: props.defaultMessages,
  retryTimes: props.retryTimes,
  retryInterval: props.retryInterval,
  onFinish: (m) => emit('finish', m),
  onError: (m) => emit('error', m),
  onAbort: (m) => emit('abort', m),
});

// 包一层：对外抛 send 事件后再委托 useChat（UI 提交、快捷问题、命令式调用统一走此入口）
const onSend = (text: string) => {
  emit('send', text);
  return sendMessage(text);
};

// v-model:messages 桥接（useChat 内部 ref 为 SSOT，mutate 才能保持响应式）：
// - 受控（父传入非空初始）时以外部为准；否则让外部 model 指向内部数组，二者共享同一引用，
//   后续 push / 流式 mutate 同时对内外可见，无需逐字回传（性能友好）。
// - 仅在引用替换（setMessages / 父整体替换）时双向同步，避免 deep watch 开销。
if (messagesModel.value.length > 0) {
  setMessages(messagesModel.value);
} else {
  messagesModel.value = messages.value;
}
watch(messages, (v) => {
  if (v !== messagesModel.value) messagesModel.value = v;
});
watch(messagesModel, (v) => {
  if (v && v !== messages.value) {
    // 外部整体替换消息列表（典型：切换会话）时，若仍有在途请求先中断，
    // 避免旧流继续 mutate 已脱离的旧数组、isLoading 紊乱。
    if (isLoading.value) abort();
    setMessages(v);
  }
});

// 点击快捷问题：以其 label 作为消息发送
const onPromptSelect = (item: PromptItem) => onSend(item.label);

// 交互块动作：先就地写回消息（驱动 DOM），再对外透出供业务持久化 / 判分。
const onBlockAction = (payload: BlockActionPayload) => {
  updateBlock(String(payload.messageKey), payload.action.blockId, payload.action.patch);
  emit('block-action', payload);
};

// 用户消息编辑：先截断重发（驱动 DOM），再对外透出供持久化
const onEditMessage = (id: string, text: string) => {
  onEdit(id, text);
  emit('edit', { id, text });
};

// 赞/踩反馈：写回 extra（驱动高亮），再对外透出供持久化
const onFeedback = (id: string, value: MessageFeedback | null) => {
  setFeedback(id, value);
  emit('feedback', { id, value });
};

defineExpose({
  messages,
  isLoading,
  onSend,
  onReload,
  abort,
  setMessages,
  updateBlock,
  // 透传 Sender 命令式能力，便于外部聚焦 / 清空输入框
  focus: () => senderRef.value?.focus(),
  clear: () => senderRef.value?.clear(),
});
</script>

<style lang="scss">
.aix-ai-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: var(--aix-colorBgLayout, var(--aix-colorBgContainer));

  &__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  &__sender {
    margin: var(--aix-paddingSM) var(--aix-padding) var(--aix-padding);
  }
}
</style>
