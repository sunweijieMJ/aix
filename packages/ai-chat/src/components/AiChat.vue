<template>
  <div :class="[ns.b(), ns.is('actions-hover', actionsTrigger === 'hover')]">
    <!-- 可选标题栏：传 headerTitle/headerIcon 或提供 header* 任一插槽时渲染。
         默认布局为 [图标] 标题 …… [extra]；header slot 可完全覆盖。关闭等交互由业务填 header-extra。 -->
    <div v-if="hasHeader" :class="ns.e('header')">
      <slot name="header">
        <span v-if="headerIcon || $slots['header-icon']" :class="ns.e('header-icon')">
          <slot name="header-icon"><img :src="headerIcon" alt="" /></slot>
        </span>
        <span :class="ns.e('header-title')">{{ headerTitle }}</span>
        <span v-if="$slots['header-extra']" :class="ns.e('header-extra')">
          <slot name="header-extra" />
        </span>
      </slot>
    </div>
    <div :class="ns.e('body')">
      <Welcome v-if="messages.length === 0" :title="welcomeTitle" :description="welcomeDescription">
        <!-- 透传 Welcome 的图标/标题/描述具名插槽，供业务做品牌图标与富文本标题（如局部主色着色）。 -->
        <template v-if="$slots['welcome-icon']" #icon><slot name="welcome-icon" /></template>
        <template v-if="$slots['welcome-title']" #title><slot name="welcome-title" /></template>
        <template v-if="$slots['welcome-description']" #description>
          <slot name="welcome-description" />
        </template>
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
        <!-- 消息操作：通过 actions prop 配置（默认 ['copy','regenerate']），
             数组形态仅对 ai+success 消息渲染，函数形态按消息细粒度控制；
             可用 #footer slot 覆盖，设为 [] 关闭。仅在需要时挂载 footer slot，避免空 footer 节点。 -->
        <template v-if="actionsEnabled || $slots.footer" #footer="{ item }">
          <slot name="footer" :item="item">
            <BubbleActions
              v-if="actionsMap.get(item.id)"
              :items="actionsMap.get(item.id)!"
              :content="messageText(item)"
              :message="item"
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
      :submit-type="submitType"
      :attachments="attachments"
      :voice="voice"
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
  ActionsItems,
  AttachmentItem,
  VoiceConfig,
} from '../types';
import type { MarkdownRenderers } from '../utils/markdownWalker';
import type { MarkdownItPlugin } from '../composables/useMarkdownRenderer';
import type { UseAttachmentsOptions } from '../composables/useAttachments';

export interface AiChatProps {
  /** 发起请求，返回字节流或 Response（必填）；透传给 useChat */
  request: UseChatOptions['request'];
  /** 流分帧模式（'sse' 默认 / 'line'）；透传给 useChat */
  streamMode?: UseChatOptions['streamMode'];
  /** 流单元 → 增量解析器，默认扁平 SSE；对接 OpenAI/Anthropic 传 openaiParseChunk/anthropicParseChunk。透传给 useChat */
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
  /** 顶部标题栏标题文案；传入（或提供 header* 插槽）时渲染标题栏，默认不渲染 */
  headerTitle?: string;
  /** 顶部标题栏图标图片地址（可用 header-icon 具名插槽覆盖） */
  headerIcon?: string;
  /** 欢迎页标题（空消息态展示） */
  welcomeTitle?: string;
  /** 欢迎页描述文案（空消息态展示） */
  welcomeDescription?: string;
  /** 输入框占位提示，缺省取 locale.senderPlaceholder */
  placeholder?: string;
  /** 输入框提交方式：'enter' 回车发送（Shift+Enter 换行）/ 'shiftEnter' 反之，默认 'enter'；透传给 Sender */
  submitType?: 'enter' | 'shiftEnter';
  /**
   * 消息操作条配置，默认 ['copy','regenerate']。
   * 数组形态：仅对 role==='ai' && status==='success' 的消息渲染；
   * 函数形态：对每条消息调用，返回 items 则渲染、null/[] 不渲染（可按状态/角色细控）。
   * 设为 [] 关闭默认操作条；#footer slot 提供时优先（覆盖机制不变）。
   * 函数形态应为纯函数（同输入同输出）；返回值随消息 status 响应式更新。
   */
  actions?: ActionsItems | ((message: ChatMessage) => ActionsItems | null);
  /** 消息操作的显示时机：'always' 常驻显示（默认），'hover' 仅悬浮气泡或键盘聚焦内部按钮时显示（触屏设备始终显示） */
  actionsTrigger?: 'always' | 'hover';
  /** 是否允许用户消息内联编辑重发，默认 false */
  editable?: boolean;
  /** 请求失败自动重试次数（不含首次），默认 0；透传给 useChat。abort 不触发重试 */
  retryTimes?: UseChatOptions['retryTimes'];
  /** 两次重试间隔（ms），默认 1000；透传给 useChat */
  retryInterval?: UseChatOptions['retryInterval'];
  /** 流静默超时（ms），默认 0 关闭：超过该时长无新数据判为卡死（可重试错误）；透传给 useChat */
  streamTimeout?: UseChatOptions['streamTimeout'];
  /**
   * markdown token 渲染器注册表（扩展/覆盖气泡内 markdown 块渲染），优先级高于全局 markdownRenderers。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  markdownRenderers?: MarkdownRenderers;
  /**
   * 是否允许渲染原始 HTML（经 DOMPurify 消毒），默认 false；注入到气泡内 MarkdownRenderer。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  allowHtml?: boolean;
  /**
   * 注入的 markdown-it 插件（扩展新语法，如脚注 / 容器 / 任务列表）；注入到气泡内 MarkdownRenderer。
   * 与 markdownRenderers 互补：插件加新 tokenization，markdownRenderers 改 token 渲染。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  mdPlugins?: MarkdownItPlugin[];
  /** 附件能力（opt-in），透传 Sender；不传则无任何附件 UI。视为静态配置（setup 快照） */
  attachments?: UseAttachmentsOptions;
  /** 语音输入（opt-in），透传 Sender；不传则无麦克风按钮。视为静态配置 */
  voice?: boolean | VoiceConfig;
}
export interface AiChatEmits {
  /** 用户发送消息（含点击快捷问题），携带文本与可选附件 */
  (e: 'send', text: string, attachments?: AttachmentItem[]): void;
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
import { messageText, attachmentBlock, textBlock } from '../utils/helpers';
import { useChat } from '../composables/useChat';
import { useNamespace } from '../composables/useNamespace';
import { useAiChatConfig, provideAiChatConfig } from '../composables/useAiChatConfig';

const props = withDefaults(defineProps<AiChatProps>(), {
  actionsTrigger: 'always',
});
const emit = defineEmits<AiChatEmits>();
const ns = useNamespace('ai-chat');
const config = useAiChatConfig();
const slots = useSlots();

// AiChat 自身消费的保留插槽（标题栏 + 欢迎/内容/底部）；其余具名插槽透传给 BubbleList（最终落到块渲染器内部 slot）。
const AICHAT_RESERVED_SLOTS = [
  'header',
  'header-icon',
  'header-extra',
  'welcome-icon',
  'welcome-title',
  'welcome-description',
  'welcome-extra',
  'content',
  'footer',
];
const blockSlotNames = computed(() =>
  Object.keys(slots).filter((n) => !AICHAT_RESERVED_SLOTS.includes(n)),
);

// 标题栏渲染条件：传入 headerTitle/headerIcon，或提供 header/header-icon/header-extra 任一插槽
const hasHeader = computed(
  () =>
    !!(
      props.headerTitle ||
      props.headerIcon ||
      slots.header ||
      slots['header-icon'] ||
      slots['header-extra']
    ),
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
  mdPlugins: props.mdPlugins ?? config.value.mdPlugins,
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
  streamMode: props.streamMode,
  parseChunk: props.parseChunk,
  parser: props.parser,
  defaultMessages: props.defaultMessages,
  retryTimes: props.retryTimes,
  retryInterval: props.retryInterval,
  streamTimeout: props.streamTimeout,
  onFinish: (m) => emit('finish', m),
  onError: (m) => emit('error', m),
  onAbort: (m) => emit('abort', m),
});

// 包一层：对外抛 send 事件后再委托 useChat（UI 提交、快捷问题、命令式调用统一走此入口）
const onSend = (text: string, attachments?: AttachmentItem[]) => {
  if (attachments?.length) {
    emit('send', text, attachments);
    const blocks = [attachmentBlock(attachments), ...(text ? [textBlock(text)] : [])];
    return sendMessage(blocks);
  }
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

// 交互块动作：先就地写回消息（驱动 DOM），仅当写回命中时再对外透出供业务持久化 / 判分，
// 避免未命中（误传 id）时业务据空动作持久化、与实际消息状态不一致。
const onBlockAction = (payload: BlockActionPayload) => {
  const hit = updateBlock(String(payload.messageKey), payload.action.blockId, payload.action.patch);
  if (hit) emit('block-action', payload);
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

// 消息操作条配置逻辑
const DEFAULT_ACTIONS: ActionsItems = ['copy', 'regenerate'];

// 函数形态对每条消息调用；数组形态保持现状语义（仅 ai+success）
const actionsFor = (item: ChatMessage): ActionsItems | null => {
  const a = props.actions ?? DEFAULT_ACTIONS;
  if (typeof a === 'function') {
    const r = a(item);
    return r && r.length > 0 ? r : null;
  }
  if (item.role !== 'ai' || item.status !== 'success') return null;
  // 1→N 拆分：默认操作条仅末子气泡显示，避免每个子气泡重复一条（函数形态由业务自控）
  const sub = item.extra?.__sub as { index: number; count: number } | undefined;
  if (sub && sub.index < sub.count - 1) return null;
  return a.length > 0 ? a : null;
};

// 每条消息的操作条配置（一次计算）：函数形态的用户函数每条消息每轮只调用一次，
// 且 v-if 与 :items 读同一结果，避免两次调用结果不一致。
// 依赖 parsedMessages 及各 item 的 role/status，status 流转（updating→success）会触发重算。
const actionsMap = computed(() => {
  const map = new Map<string, ActionsItems | null>();
  for (const item of parsedMessages.value) map.set(item.id, actionsFor(item));
  return map;
});

// 数组形态为空数组时整个 footer 模板都不挂（避免空 footer 节点）；函数形态恒挂、逐条判定
const actionsEnabled = computed(
  () => typeof props.actions === 'function' || (props.actions ?? DEFAULT_ACTIONS).length > 0,
);

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

  /* 可选标题栏：底部细分隔线，左图标 + 标题，右侧 extra（关闭等）靠边 */
  &__header {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--aix-sizeXS);
    padding: var(--aix-paddingSM) var(--aix-padding);
    border-bottom: 1px solid var(--aix-colorBorderSecondary);
  }

  &__header-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;

    img {
      width: 20px;
      height: 20px;
    }
  }

  &__header-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--aix-colorTextHeading);
    font-size: var(--aix-fontSize);
    font-weight: var(--aix-fontWeightStrong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__header-extra {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--aix-sizeXS);
  }

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
