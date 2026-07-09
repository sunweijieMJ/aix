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
      <Welcome
        v-if="messages.length === 0 && !historyLoading"
        :title="welcomeTitle"
        :description="welcomeDescription"
      >
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
        ref="bubbleListRef"
        :items="parsedMessages"
        :roles="roles"
        :should-follow="shouldFollow"
        :typing="config.enableTyping"
        :block-renderers="blockRenderers"
        :tool-renderers="toolRenderers"
        :save-disabled="isLoading"
        :loading="historyLoading"
        @retry="onReload"
        @block-action="onBlockAction"
        @edit="onEditMessage"
        @typing-complete="emit('typing-complete', $event)"
      >
        <!-- 透传气泡内容作用域 slot：使用方提供时覆盖默认 Markdown 渲染 -->
        <template v-if="$slots.content" #content="slotProps">
          <slot name="content" v-bind="slotProps" />
        </template>
        <!-- 消息操作：通过 actions prop 配置（默认 ['copy','regenerate']），
             数组形态仅对 ai+success 消息渲染，函数形态按消息细粒度控制；
             可用 #footer slot 覆盖，设为 [] 关闭。branchAware 确保分支切换器可按需出现。 -->
        <template v-if="actionsEnabled || branchAware || $slots.footer" #footer="{ item }">
          <slot name="footer" :item="item">
            <BubbleActions
              v-if="actionsMap.get(item.id) || branchMap.get(item.id)"
              :items="actionsMap.get(item.id) ?? []"
              :content="messageText(item)"
              :message="item"
              :feedback="(item.extra?.feedback as MessageFeedback | null) ?? null"
              :speaking="speakingId === item.id"
              :branch="branchMap.get(item.id)"
              :branch-disabled="isLoading"
              @copy="emit('copy', item)"
              @regenerate="onReload(item.id)"
              @feedback="onFeedback(item.id, $event)"
              @speak="speech?.toggle(item)"
              @switch-branch="switchBranch(item.id, $event)"
              @quote="onQuoteMessage(item)"
              @edit="bubbleListRef?.startEdit(item.id)"
              @delete="emit('delete', item)"
            />
          </slot>
        </template>
        <!-- 透传块插槽：把非保留具名插槽（约定 <块类型>-<内部slot>）逐层下传，
             经 BubbleList → Bubble 最终落到块渲染器内部 slot。 -->
        <template v-for="name in blockSlotNames" :key="name" #[name]="sp">
          <slot :name="name" v-bind="sp" />
        </template>
      </BubbleList>
      <template v-if="quoteMenu.visible.value">
        <slot
          name="quote-menu"
          :items="quoteMenu.items.value"
          :invoke="quoteMenu.invoke"
          :close="quoteMenu.close"
          :mode="quoteMenu.mode.value"
          :selection="active"
          :trigger="trigger"
        >
          <QuoteMenu
            :items="quoteMenu.items.value"
            :source="quoteMenu.source.value"
            :mode="quoteMenu.mode.value"
            :get-rect="active?.getRect"
            :point="trigger?.point"
            :context-el="quoteRoot"
            :toolbar="resolvedQuote.toolbar"
            :sheet="resolvedQuote.sheet"
            @invoke="quoteMenu.invoke"
            @close="quoteMenu.close"
          />
        </slot>
      </template>
    </div>
    <Suggestions
      v-if="visibleSuggestions.length"
      :class="ns.e('suggestions')"
      :items="visibleSuggestions"
      @select="onSuggestionSelect"
    />
    <Sender
      ref="senderRef"
      v-model="inputModel"
      :class="ns.e('sender')"
      :loading="isLoading"
      :placeholder="placeholder"
      :submit-type="submitType"
      :attachments="attachments"
      :voice="voice"
      :triggers="triggers"
      :toolbar-items="toolbarItems"
      :allow-empty-submit="pendingQuotes.length > 0"
      @submit="onSend"
      @cancel="abort"
    >
      <template v-if="pendingQuotes.length" #header>
        <div :class="ns.e('quote-chips')">
          <QuoteChip
            v-for="q in visibleQuotes"
            :key="q.id"
            :quote="q"
            @remove="removeQuote(q.id)"
            @locate="locateAnchor(q.anchor)"
          />
          <button
            v-if="!chipsExpanded && hiddenChipCount > 0"
            type="button"
            :class="ns.e('quote-chips-toggle')"
            :aria-label="t.quoteChipsExpand"
            :title="t.quoteChipsExpand"
            @click="chipsExpanded = true"
          >
            +{{ hiddenChipCount }}
          </button>
          <button
            v-else-if="chipsExpanded && hiddenChipCount > 0"
            type="button"
            :class="ns.e('quote-chips-toggle')"
            :aria-label="t.quoteChipsCollapse"
            :title="t.quoteChipsCollapse"
            @click="chipsExpanded = false"
          >
            {{ t.quoteChipsCollapse }}
          </button>
        </div>
      </template>
      <template v-if="$slots.toolbar" #toolbar="scope">
        <slot name="toolbar" v-bind="scope" />
      </template>
      <template v-if="$slots.prefix" #prefix="scope">
        <slot name="prefix" v-bind="scope" />
      </template>
    </Sender>
  </div>
</template>

<script lang="ts">
export interface AiChatProps {
  /**
   * 发起请求，返回字节流或 Response（必填）；透传给 useChat。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  request: UseChatOptions['request'];
  /**
   * 流分帧模式（'sse' 默认 / 'line'）；透传给 useChat。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  streamMode?: UseChatOptions['streamMode'];
  /**
   * 流单元 → 增量解析器，默认扁平 SSE；对接 OpenAI/Anthropic 传 openaiParseChunk/anthropicParseChunk。透传给 useChat。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  parseChunk?: UseChatOptions['parseChunk'];
  /**
   * 渲染消息转换器（解耦后端格式与展示形状，1→1，须保留消息 id）；透传给 useChat。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  parser?: UseChatOptions['parser'];
  /** 初始历史消息 */
  defaultMessages?: UseChatOptions['defaultMessages'];
  /**
   * 历史消息加载中：true 时消息区渲染骨架屏（占位假气泡），而不是空消息态的 Welcome 或
   * 真实 BubbleList；用于业务从远端异步恢复会话历史时的过渡态（如接入 useConversations
   * 异步 storage.load，配合其 isLoading 传入本 prop）。默认 false（不生效时行为不变：
   * messages 为空显示 Welcome，否则显示 BubbleList）。透传给 BubbleList 的 loading prop。
   */
  historyLoading?: boolean;
  /**
   * 输入框文本（v-model:input）。可选；不传则走非受控，由组件内部维护草稿。
   * 注意：不要设默认值——为兼容 Vue 3.3（useModel emit-only 语义），受控/非受控的判定
   * 依赖此 prop 是否为 undefined，交由 useControllable 的 defaultValue 兜底。
   */
  input?: string;
  /** 角色气泡样式映射，优先级高于 provideAiChatConfig 的全局 roles */
  roles?: Record<string, RoleConfig>;
  /** 滚动跟随策略，优先级高于 provideAiChatConfig 的全局 shouldFollow */
  shouldFollow?: ShouldFollow;
  /** 块渲染器注册表（扩展/覆盖内置 text/reasoning 渲染），优先级高于 provideAiChatConfig 的全局 blockRenderers */
  blockRenderers?: BlockRenderers;
  /** 工具调用（tool_use）渲染器注册表，按 toolName 路由，优先级高于 provideAiChatConfig 的全局 toolRenderers */
  toolRenderers?: BlockRenderers;
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
  /**
   * 请求失败自动重试次数（不含首次），默认 0；透传给 useChat。abort 不触发重试。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  retryTimes?: UseChatOptions['retryTimes'];
  /**
   * 两次重试间隔（ms），默认 1000；透传给 useChat。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  retryInterval?: UseChatOptions['retryInterval'];
  /**
   * 流静默超时（ms），默认 0 关闭：超过该时长无新数据判为卡死（可重试错误）；透传给 useChat。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  streamTimeout?: UseChatOptions['streamTimeout'];
  /**
   * markdown token 渲染器注册表（扩展/覆盖气泡内 markdown 块渲染），优先级高于全局 markdownRenderers。
   * 注意：视为静态配置，仅在组件初始化时取值（setup 快照），运行时修改不生效，需重建组件。
   */
  markdownRenderers?: MarkdownRenderers;
  /**
   * 是否允许渲染原始 HTML（经 sandbox iframe 隔离渲染：allow-scripts，无 allow-same-origin），默认 false；注入到气泡内 MarkdownRenderer。
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
  /**
   * 语音播报（opt-in），透传内置 useSpeech；不传则无朗读按钮、不自动播报。
   * true=全默认（speechSynthesis）；对象=自定义合成器 / autoPlay / getText 等。视为静态配置（setup 快照）。
   * 注意：actions 为函数形态时不会自动追加内置 speak 项，需业务在返回数组中自行包含 'speak'；数组/默认形态会自动为 ai+success 且有可朗读文本的消息追加。
   */
  speech?: boolean | SpeechConfig;
  /**
   * 对话树（v-model:tree）：分支感知的持久化通道，绑 useConversations.activeTree。
   * 不传则不参与树级持久化。同时绑 v-model:messages 与 v-model:tree 时以 tree 为准；
   * 推荐持久化场景用 tree，两者择一。
   */
  tree?: ExportedTree;
  /**
   * 划词引用/追问（默认启用）。false 关闭；对象按 QuoteConfig 细配，
   * 与全局 provideAiChatConfig().quote 合并（props 优先）。视为静态配置（setup 快照）。
   */
  quote?: QuoteConfig | boolean;
  /** 触发菜单配置（@提及/斜杠命令），直通 Sender；静态配置（setup 快照） */
  triggers?: TriggerConfig[];
  /** 工具栏项（内置 attach/voice + 自定义对象混排），直通 Sender；不传则用 Sender 默认值 ['attach','voice'] */
  toolbarItems?: SenderToolbarItems;
  /**
   * 追问建议（opt-in）：true 全默认；对象可配 fillOnly（点击仅回填不发送）/ max（上限，默认 5）。
   * 联合类型含 boolean：withDefaults 必须显式 default undefined（同 quote 的坑）
   */
  suggestions?: boolean | { fillOnly?: boolean; max?: number };
}
export interface AiChatEmits {
  /** 用户发送消息（含点击快捷问题），携带文本与可选附件、可选扩展元信息（如 mention 实体） */
  (e: 'send', text: string, attachments?: AttachmentItem[], meta?: SubmitMeta): void;
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
  /** 请求删除某条消息（只上抛，不改动 messages/分支树——是否真的移除、是否同步后端，完全交给业务） */
  (e: 'delete', message: ChatMessage): void;
  /** AI 回复赞/踩反馈变化，携带 id 与值（null 取消），供业务持久化 */
  (e: 'feedback', payload: { id: string; value: MessageFeedback | null }): void;
  /** 某条 AI 消息逐字显示完毕，携带消息 id（流式打字机追平末尾时触发） */
  (e: 'typing-complete', id: string): void;
  /** 输入框文本变化（v-model:input），由 useControllable 在受控/非受控两态下统一上抛 */
  (e: 'update:input', value: string): void;
  /** 对话树结构变化（v-model:tree），用于持久化分支 */
  (e: 'update:tree', value: ExportedTree): void;
  /** 点击追问建议（发送/回填之前触发，供埋点） */
  (e: 'suggestion-select', item: SuggestionItem): void;
}
</script>

<script setup lang="ts">
import { useNamespace, useControllable, useLocale, copyText } from '@aix/hooks';
import {
  computed,
  ref,
  shallowRef,
  toRaw,
  watch,
  useSlots,
  getCurrentInstance,
  provide,
} from 'vue';
import { useAiChatConfig, provideAiChatConfig } from '../composables/useAiChatConfig';
import type { UseAttachmentsOptions } from '../composables/useAttachments';
import type { ShouldFollow } from '../composables/useAutoScroll';
import { useChat } from '../composables/useChat';
import type { UseChatOptions } from '../composables/useChat';
import type { MarkdownItPlugin } from '../composables/useMarkdownRenderer';
import { useQuoteMenu, QUOTE_LOCATE_KEY } from '../composables/useQuoteMenu';
import { useSpeech } from '../composables/useSpeech';
import { useTextSelection } from '../composables/useTextSelection';
import { locale } from '../locale';
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
  SpeechConfig,
  SubBubbleMeta,
  ExportedTree,
  Quote,
  QuoteAnchor,
  QuoteConfig,
  TriggerConfig,
  SubmitMeta,
  SuggestionItem,
} from '../types';
import {
  BUBBLE_CONTENT_SELECTOR,
  messageText,
  attachmentBlock,
  textBlock,
  quoteBlock,
  genQuoteId,
  normalizeSuggestions,
} from '../utils/helpers';
import type { MarkdownRenderers } from '../utils/markdownWalker';
import { upsertQuote } from '../utils/quoteDedupe';
import { highlightRange, highlightElement } from '../utils/quoteHighlight';
import { flattenQuoteBlocks } from '../utils/quotePrompt';
import { findTextRange, offsetsToRange } from '../utils/textRange';
import BubbleActions from './BubbleActions.vue';
import BubbleList from './BubbleList.vue';
import Prompts from './Prompts.vue';
import QuoteChip from './QuoteChip.vue';
import QuoteMenu from './QuoteMenu.vue';
import Sender from './Sender.vue';
import type { SenderToolbarItems } from './Sender.vue';
import Suggestions from './Suggestions.vue';
import Welcome from './Welcome.vue';

const props = withDefaults(defineProps<AiChatProps>(), {
  actionsTrigger: 'always',
  // 显式给 undefined 默认值（而非不声明）：quote 联合类型含 boolean，Vue 对「类型含 Boolean
  // 且无 default」的 prop 有隐式转换——未传时会被自动转成 false 而非 undefined（boolean casting），
  // 导致 resolvedQuote 无法区分「未配置（应启用默认）」与「显式 quote={false}（应关闭）」。
  // 显式声明 default:undefined 可关闭该转换，让未传时 props.quote 保持真正的 undefined。
  quote: undefined,
  // suggestions 同款联合类型含 boolean 的坑，同上显式声明 default:undefined。
  suggestions: undefined,
});
const emit = defineEmits<AiChatEmits>();
const ns = useNamespace('ai-chat');
const config = useAiChatConfig();
const slots = useSlots();
const { t } = useLocale(locale);

// 划词引用配置：全局 config.quote < 组件 props.quote；boolean 简写归一化
const resolvedQuote = computed<
  Required<Pick<QuoteConfig, 'enable' | 'pcQuoteAction' | 'maxVisibleChips'>> & QuoteConfig
>(() => {
  const fromProps: QuoteConfig =
    props.quote === false
      ? { enable: false }
      : props.quote === true || props.quote == null
        ? {}
        : props.quote;
  const merged: QuoteConfig = { ...config.value.quote, ...fromProps };
  return { enable: true, pcQuoteAction: true, maxVisibleChips: 3, ...merged };
});

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
  'quote-menu',
  'toolbar',
  'prefix',
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
// 此处刻意保留 defineModel：messagesModel 仅作对外镜像，UI 实际渲染 useChat 的 parsedMessages（SSOT），
// 且与 useChat 内部数组共享引用（见下方 SSOT 桥接）。Vue 3.3 下非受控时镜像写入虽被 emit-only 丢弃，
// 但 UI 不依赖它、受控/单向场景 emit 照常触发，故对该 SSOT 场景是优雅降级，无需 useControllable。
const messagesModel = defineModel<ChatMessage[]>('messages', { default: () => [] });
// 输入框文本（v-model:input）：组件内部（Sender 回填、发送清空、草稿保留）会写入本 model，
// 属于「内部写入 + 支持非受控」场景。Vue 3.3 的 useModel 为 emit-only，非受控下本地写入会丢失，
// 故改用 useControllable：非受控时由内部 ref 持有、受控时只 emit。prop input 必须保持无默认值。
const { state: inputModel } = useControllable<string>({
  prop: () => props.input,
  defaultValue: '',
  onChange: (v) => emit('update:input', v),
});
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

// 工具调用渲染器合并优先级：组件 props.toolRenderers > 全局 provideAiChatConfig.toolRenderers
// （与 blockRenderers 并列的独立注册表，专供 tool_use 块按 toolName 路由）
const toolRenderers = computed<BlockRenderers>(() => ({
  ...config.value.toolRenderers,
  ...props.toolRenderers,
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

// 开发期护栏：上面三项 markdown 级配置是 setup 时快照，运行时改 props 不会重新 provide，
// 子树渲染静默维持旧配置、极难排查。检测到变更时告警一次（与未注册渲染器告警同风格）。
let warnedStaticMdConfig = false;
watch(
  () => [props.markdownRenderers, props.allowHtml, props.mdPlugins],
  () => {
    if (warnedStaticMdConfig) return;
    warnedStaticMdConfig = true;
    console.warn(
      '[ai-chat] markdownRenderers / allowHtml / mdPlugins 为挂载时快照，运行时变更不会生效；如需切换请通过 key 强制重建 AiChat 实例。',
    );
  },
);

// 开发期护栏（同上）：useChat 的配置项也是 setup 时快照（useChat 内一次性解构），运行时改 props 静默不生效。
// 仅原始类型 prop 进 watch；request / parseChunk / parser 为函数 prop，业务常以内联箭头函数传入
// （父组件每次渲染产生新引用），进 watch 会持续误报，故只在 props 注释中声明静态语义，不做运行时检测。
let warnedStaticChatConfig = false;
watch(
  () => [props.streamMode, props.retryTimes, props.retryInterval, props.streamTimeout],
  () => {
    if (warnedStaticChatConfig) return;
    warnedStaticChatConfig = true;
    console.warn(
      '[ai-chat] streamMode / retryTimes / retryInterval / streamTimeout（以及 request / parseChunk / parser）为挂载时快照，运行时变更不会生效；如需切换请通过 key 强制重建 AiChat 实例。',
    );
  },
);

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
  branches,
  switchBranch,
  getBranches,
  exportTree,
  importTree,
  resume,
} = useChat({
  // 请求期把 quote 块拍平成 blockquote 文本给 business（纯函数，不 mutate SSOT，见设计 §2.1）；
  // 无 quote 块时逐条直通，零开销
  request: (ctx) =>
    props.request({
      ...ctx,
      messages: flattenQuoteBlocks(ctx.messages, resolvedQuote.value.toPrompt),
    }),
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

// ============ 追问建议（spec §5.2）============
const resolvedSuggestions = computed(() => {
  const s = props.suggestions;
  if (!s) return null;
  return { fillOnly: false, max: 5, ...(s === true ? {} : s) };
});
// 通道①临时建议（不持久化，发送即清）
const tempSuggestions = shallowRef<SuggestionItem[] | null>(null);
/**
 * 命令式立即展示临时建议（通道①，优先于通道②）。
 * 传空数组时置 null，语义为「归位到通道②」（显示最后一条 AI 消息自带的建议，若有）。
 */
const setSuggestions = (items: Array<string | SuggestionItem>) => {
  tempSuggestions.value = items.length ? normalizeSuggestions(items) : null;
};
// 任何新流开始（发送/重生成/编辑重发/续流）即清通道①临时建议，与「发送即清」同语义；
// 覆盖 onReload/onEdit/resume 等不经 onSend 包装的新流起点。onSend 里既有的清理保留（防御性双保险）。
watch(isLoading, (v) => {
  if (v) tempSuggestions.value = null;
});
// 通道②宿主：最后一条 AI 消息（用 useChat 原始 messages，不经 parser 映射）
const lastAiMessage = computed(() => {
  const list = messages.value;
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (item?.role === 'ai') return item;
  }
  return null;
});
const visibleSuggestions = computed(() => {
  const cfg = resolvedSuggestions.value;
  if (!cfg || isLoading.value) return [];
  const list = tempSuggestions.value ?? lastAiMessage.value?.suggestions ?? [];
  return list.slice(0, cfg.max);
});
const onSuggestionSelect = (item: SuggestionItem) => {
  emit('suggestion-select', item);
  const cfg = resolvedSuggestions.value;
  if (cfg?.fillOnly) {
    senderRef.value?.setValue(item.text);
    senderRef.value?.focus();
  } else {
    onSend(item.text); // 复用内部发送路径（quote/附件打包、send 事件、发送即清除）
  }
};

// ==================== 划词引用 / 追问 ====================

// 待发引用（唯一归属 AiChat：它 own input model + senderRef；L2 经注入的 insertQuote 写入）
const pendingQuotes = ref<Quote[]>([]);
// 锚点去重 + 意图更新（见 utils/quoteDedupe）：同一段文字反复引用只保留一条 chip
const insertQuote = (q: Quote) => {
  pendingQuotes.value = upsertQuote(pendingQuotes.value, q);
};
const removeQuote = (id: string) => {
  pendingQuotes.value = pendingQuotes.value.filter((q) => q.id !== id);
};

// chip 折叠：超过 maxVisibleChips 收起为「+N」，点击展开；数量回落到阈值内（含发送后清空）自动复位
const chipsExpanded = ref(false);
const hiddenChipCount = computed(() =>
  Math.max(0, pendingQuotes.value.length - resolvedQuote.value.maxVisibleChips),
);
const visibleQuotes = computed(() => {
  const max = resolvedQuote.value.maxVisibleChips;
  return chipsExpanded.value || pendingQuotes.value.length <= max
    ? pendingQuotes.value
    : pendingQuotes.value.slice(0, max);
});
watch(pendingQuotes, (list) => {
  if (list.length <= resolvedQuote.value.maxVisibleChips) chipsExpanded.value = false;
});

const bubbleListRef = ref<InstanceType<typeof BubbleList> | null>(null);
const quoteRoot = computed(() => bubbleListRef.value?.scrollElement?.() ?? null);

// L1：检测（BubbleList 渲染后 quoteRoot 才非空，watch immediate 装配在 useTextSelection 内部处理）
const {
  active,
  trigger,
  clear: clearSelection,
} = useTextSelection({
  root: quoteRoot,
  enabled: () => resolvedQuote.value.enable,
  longPressDelay: resolvedQuote.value.longPressDelay,
  contextChars: 32,
  keyboard: resolvedQuote.value.keyboard,
  roles: () => resolvedQuote.value.roles ?? ['ai'],
  excludeSelector: resolvedQuote.value.excludeSelector,
});

// 回链：滚到消息 → 等挂载 → 块内文本搜索还原 Range 高亮（主路径），偏移快路径兜底，
// 整条引用/未命中 → 整气泡高亮降级（见设计 §6）
const locateAnchor = async (anchor: QuoteAnchor) => {
  const el = await bubbleListRef.value?.scrollToBubble(anchor.source.messageId, { smooth: true });
  if (!el) return; // 派生 id 不在当前分支等 → 优雅降级不高亮
  const isWhole = anchor.start == null && !anchor.source.blockId;
  if (isWhole) {
    highlightElement(el);
    return;
  }
  const host =
    (anchor.source.blockId &&
      el.querySelector<HTMLElement>(
        `[data-aix-block-id="${CSS.escape(anchor.source.blockId)}"]`,
      )) ||
    el.querySelector<HTMLElement>(BUBBLE_CONTENT_SELECTOR) ||
    el;
  const range =
    findTextRange(host, anchor.exact, anchor.prefix, anchor.suffix) ??
    (anchor.start != null && anchor.end != null
      ? offsetsToRange(host, anchor.start, anchor.end)
      : null);
  if (range) highlightRange(range);
  else highlightElement(el);
};

// L2：控制器（依赖注入，见 useQuoteMenu 契约）
const quoteMenu = useQuoteMenu({
  selection: active,
  trigger,
  actions: () => resolvedQuote.value.actions,
  insertQuote,
  setSenderValue: (text) => senderRef.value?.setValue(text),
  focusSender: () => {
    senderRef.value?.focus();
    // 选区保全由 QuoteToolbar 的 mousedown.prevent 覆盖菜单交互期间；动作完成聚焦输入框时
    // 应让选区自然清除，否则 preserve() 触发 selectionchange 会导致菜单重弹（且造成选区高亮残留）
  },
  copy: copyText,
  onLocate: locateAnchor,
  messageFor: (id) => parsedMessages.value.find((m) => m.id === id),
});

// 菜单关闭时同步清 L1 目标（下次交互重新产出）；滚动即关闭（virtua 回收锚点会失效）
watch(quoteMenu.visible, (v) => {
  if (!v) clearSelection();
});
watch(
  quoteRoot,
  (el, _old, onCleanup) => {
    if (!el) return;
    const onScroll = () => clearSelection();
    el.addEventListener('scroll', onScroll, { passive: true });
    onCleanup(() => el.removeEventListener('scroll', onScroll));
  },
  { immediate: true },
);

// PC 操作栏整条引用：与移动长按整条走完全同一条 L2 出口（insertQuote → chip → focus）
const onQuoteMessage = (item: ChatMessage) => {
  insertQuote({
    id: genQuoteId(),
    anchor: { source: { messageId: item.id, role: item.role }, exact: messageText(item) },
  });
  senderRef.value?.focus();
};

// 历史 quote 块 / chip 的回链通道（QuoteBlock inject 消费）
provide(QUOTE_LOCATE_KEY, (q: Quote) => locateAnchor(q.anchor));

// 包一层：对外抛 send 事件后再委托 useChat；pendingQuotes 打包成一等 quote 块前置进 content
// （单源真源，无 extra.quotes；见设计 §2.1），发送即清空
const onSend = (text: string, attachments?: AttachmentItem[], meta?: SubmitMeta) => {
  const quotes = pendingQuotes.value;
  tempSuggestions.value = null; // 发送即清除通道①临时建议（含点击建议本身）
  // meta 存在才携带第三参：无 meta 时保持旧签名（一/两参）完全兼容
  if (meta) emit('send', text, attachments?.length ? attachments : undefined, meta);
  else if (attachments?.length) emit('send', text, attachments);
  else emit('send', text);
  if (!quotes.length && !attachments?.length) return sendMessage(text);
  const blocks = [
    ...(quotes.length ? [quoteBlock(quotes)] : []),
    ...(attachments?.length ? [attachmentBlock(attachments)] : []),
    ...(text ? [textBlock(text)] : []),
  ];
  pendingQuotes.value = [];
  return sendMessage(blocks);
};

// v-model:messages 桥接：messages 现为对话树派生的只读 computed。
// - 受控（父传入非空初始）时导入为线性树；
// - 否则把当前 active path 镜像给外部 model。
// active path 引用仅在结构变化（增节点/切分支）时变，watch 同步即可，无需 deep。
if (messagesModel.value.length > 0) {
  setMessages(messagesModel.value);
} else {
  messagesModel.value = messages.value;
}
// 是否绑定了 v-model:tree：以 tree 为权威持久化通道时，messages 仅作只读镜像输出，
// 不再反向导入——否则两条桥接在同一 flush 同时回写父级两个 model，messages model 会被
// prop 回灌成 []，触发 setMessages([]) 把内部树清空（亦是「同绑即崩」的根因）。
// 用编译后的 vnode props 探测：v-model:tree 必带 onUpdate:tree 监听，初值为 undefined 也能识别。
const vnodeProps = getCurrentInstance()?.vnode.props;
const isTreeBound = !!vnodeProps && ('onUpdate:tree' in vnodeProps || 'tree' in vnodeProps);
watch(messages, (v) => {
  if (v !== messagesModel.value) messagesModel.value = v;
});
watch(messagesModel, (v) => {
  // tree 受控时禁用 messages 反向导入（tree 通道唯一权威），仅保留 messages 输出镜像。
  if (isTreeBound) return;
  // 身份判等必须用 toRaw：父侧若把 model 存进深响应式源（如 useConversations 的会话仓库），
  // 回灌的 v 是同一数组的 reactive proxy——直接 !== 恒真，会与上方镜像输出 watch 形成
  // setMessages ⇄ 镜像 的无限乒乓（Maximum recursive updates，流式期每帧结构变化即触发）。
  if (v && toRaw(v) !== toRaw(messages.value)) {
    // 外部整体替换消息列表（典型：切换会话）时，若仍有在途请求先中断，
    // 避免旧流继续 mutate 已脱离的旧对象、isLoading 紊乱。
    if (isLoading.value) abort();
    setMessages(v);
    tempSuggestions.value = null; // 切会话：旧会话的通道①临时建议不得跨会话残留显示
  }
});

// v-model:tree 桥接：分支感知的持久化通道。
// 受控时以 tree 为准（优先于 messages），外部替换整体 tree 时（切会话）导入；
// 结构变化（增节点/切分支）时导出回父。同时绑 v-model:messages 与 v-model:tree 时，tree 优先。
const treeModel = defineModel<ExportedTree | undefined>('tree');
// 受控：父提供初始 tree 时导入（优先于 messages）
if (treeModel.value && treeModel.value.nodes.length) {
  importTree(treeModel.value);
}
// 结构变化（增节点/切分支）时导出回父；branches 引用变化是结构变化的可靠信号
watch([messages, branches], () => {
  treeModel.value = exportTree();
});
// 外部整体替换 tree（切会话）时导入；空树（切到新会话/空白会话）同样需要导入以清空内部树
watch(treeModel, (v) => {
  if (!v) return;
  const cur = exportTree();
  // 空树（切到新会话）也需导入以清空内部树；仅在结构不同时才导入，避免与导出 watch 产生抖动
  if (v.headId !== cur.headId || v.nodes.length !== cur.nodes.length) {
    if (isLoading.value) abort();
    importTree(v);
    tempSuggestions.value = null; // 切会话：旧会话的通道①临时建议不得跨会话残留显示
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

// 用户消息编辑：先截断重发（驱动 DOM），仅当 useChat 受理（返回 true）时再对外透出供持久化，
// 避免守卫拒绝（流式进行中等）编辑被静默丢弃时业务仍收到 'edit' 误持久化（与 onBlockAction 同构）
const onEditMessage = async (id: string, text: string) => {
  const accepted = await onEdit(id, text);
  if (accepted) emit('edit', { id, text });
};

// 赞/踩反馈：写回 extra（驱动高亮），再对外透出供持久化
const onFeedback = (id: string, value: MessageFeedback | null) => {
  setFeedback(id, value);
  emit('feedback', { id, value });
};

// 语音播报（opt-in，setup 快照，与 voice 对称）：仅 speech 存在时创建实例
const speech = props.speech
  ? useSpeech({ config: props.speech === true ? {} : props.speech })
  : null;
const speakingId = computed(() => speech?.speakingId.value ?? null);
const speechAutoPlay = computed(
  () => !!speech && (props.speech === true ? false : !!(props.speech as SpeechConfig).autoPlay),
);

// 消息操作条配置逻辑
const DEFAULT_ACTIONS: ActionsItems = ['copy', 'regenerate'];

// 函数形态对每条消息调用；数组形态保持现状语义（仅 ai+success）
const actionsFor = (item: ChatMessage): ActionsItems | null => {
  const a = props.actions ?? DEFAULT_ACTIONS;
  if (typeof a === 'function') {
    const r = a(item);
    return r && r.length > 0 ? r : null;
  }
  if (item.role === 'user') {
    // 固定默认值（不含 delete），不受 props.actions 数组内容影响（数组形态历史语义只配置 AI 消息）；
    // isLoading 时收窄为 [copy]——原本气泡自带铅笔按钮在全局 loading 时整个不渲染
    // （避免草稿在 loading 期间被静默丢弃），这里保留同等的"隐藏入口"效果。
    return isLoading.value ? ['copy'] : ['copy', 'edit'];
  }
  if (item.role !== 'ai' || item.status !== 'success') return null;
  // 1→N 拆分：默认操作条仅末子气泡显示
  const sub = item.extra?.__sub as SubBubbleMeta | undefined;
  if (sub && sub.index < sub.count - 1) return null;
  const base: ActionsItems = a.length > 0 ? [...a] : [];
  // quote 启用且未被业务显式声明时自动注入（策略 A）；函数形态不自动注入（与 speak 同规则）
  if (resolvedQuote.value.enable && resolvedQuote.value.pcQuoteAction && !base.includes('quote')) {
    base.push('quote');
  }
  // speech 启用且该消息有可朗读文本时追加内置 speak（即便 base 为空也显示，speech 是独立 opt-in）
  if (speech && speech.isSupported.value && speech.resolveText(item)) base.push('speak');
  return base.length > 0 ? base : null;
};

// 每条消息的操作条配置（一次计算）：函数形态的用户函数每条消息每轮只调用一次，
// 且 v-if 与 :items 读同一结果，避免两次调用结果不一致。
// 依赖 parsedMessages 及各 item 的 role/status，status 流转（updating→success）会触发重算。
const actionsMap = computed(() => {
  const map = new Map<string, ActionsItems | null>();
  for (const item of parsedMessages.value) map.set(item.id, actionsFor(item));
  return map;
});

// 数组形态为空数组时整个 footer 模板都不挂（避免空 footer 节点）；函数形态恒挂、逐条判定；
// speech 启用时也须挂 footer 以呈现朗读按钮；
// 用户消息的操作条为固定默认值（['copy','edit']，加载中为 ['copy']），
// 不受 props.actions 数组形态影响（数组形态只作用于 AI 消息），
// 因此只要消息列表中存在用户消息，footer 就必须挂载，避免 actions=[] 时连用户消息的固定操作条也被误挂断
const actionsEnabled = computed(
  () =>
    typeof props.actions === 'function' ||
    (props.actions ?? DEFAULT_ACTIONS).length > 0 ||
    !!speech ||
    (resolvedQuote.value.enable && resolvedQuote.value.pcQuoteAction) ||
    parsedMessages.value.some((m) => m.role === 'user'),
);

// 每条可见消息的分支元信息（branches 按逻辑消息 id 键；getBranches 内部已解析派生 id）
const branchMap = computed(() => {
  const map = new Map<string, ReturnType<typeof getBranches>>();
  for (const item of parsedMessages.value) {
    const sub = item.extra?.__sub as SubBubbleMeta | undefined;
    // 1→N 拆分：分支切换器仅在末子气泡显示（与操作条同规则），避免每个子气泡各挂一个
    map.set(item.id, sub && sub.index < sub.count - 1 ? undefined : getBranches(item.id));
  }
  return map;
});

// 存在实际分支（有多版本）或加载中时，footer 需对所有消息（含用户消息）可挂载，
// 以便分支切换器在任意位置出现；isLoading 纳入避免分支生成期间切换器闪烁重挂。
const branchAware = computed(() => branches.value.size > 0 || isLoading.value);

// autoPlay：流式 AI 回复增量喂句。autoStartedId 记录"最近一条已自动起播的消息 id"，
// 防止用户手动停止后被下一 chunk 重启。消息列表只增不回退、autoPlay 永远只作用于末条，
// 故单个 id 足够（无需 Set，避免随会话无界增长）。
let autoStartedId: string | null = null;
if (speech) {
  watch(
    () => {
      const list = parsedMessages.value;
      const last = list[list.length - 1];
      if (!last || last.role !== 'ai') return '';
      // id + status + 文本长度 作为增量信号：消息增长或状态流转即触发
      return `${last.id}:${last.status}:${messageText(last).length}`;
    },
    () => {
      if (!speechAutoPlay.value) return;
      const list = parsedMessages.value;
      const last = list[list.length - 1];
      if (!last || last.role !== 'ai') return;
      if (last.status !== 'updating' && last.status !== 'success') {
        // 终态 error/abort：若正在朗读本条流式回复，停止收尾——否则 feed 不再被调用，
        // session.finish() 永不触发，speakingId 悬挂、会话卡死。
        if (speech.speakingId.value === last.id) speech.stop();
        return;
      }
      if (autoStartedId !== last.id) {
        autoStartedId = last.id;
        speech.feed(last);
      } else if (speech.speakingId.value === last.id) {
        // 仅当仍在朗读本条时续喂（用户手动停止后 speakingId 置空 → 不重启）
        speech.feed(last);
      }
    },
  );
}

defineExpose({
  messages,
  isLoading,
  onSend,
  onReload,
  abort,
  // 包一层：外部经 ref 直设消息（如切会话）不经 v-model watch / isLoading 上升沿，
  // 须在此同步清掉通道①临时建议，防旧会话建议跨会话残留
  setMessages: (m: ChatMessage[]) => {
    tempSuggestions.value = null;
    setMessages(m);
  },
  updateBlock,
  resume,
  setSuggestions,
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

  &__suggestions {
    flex: none;
    padding: var(--aix-paddingXS) var(--aix-paddingSM) 0;
  }

  &__quote-chips {
    display: flex;
    flex-wrap: wrap;

    // flex 默认 align-items:stretch 会把同一行内高度较小的 chip 拉伸到与最高元素同高
    // （换行后第二行出现高度不一致的视觉问题）；显式 flex-start 阻断拉伸，让每个 chip/toggle 按自身内容定高。
    align-items: flex-start;
    gap: var(--aix-marginXXS);
    padding: var(--aix-paddingXXS) var(--aix-paddingXS) 0;
  }

  &__quote-chips-toggle {
    display: inline-flex;
    box-sizing: border-box;
    flex: none;
    align-items: center;

    // 与 .aix-quote-chip 共用同一控件高度 token 定死等高（padding/行高巧合对齐不可靠）
    height: var(--aix-controlHeightSM);
    padding: 0 var(--aix-paddingXS);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusSM);
    background-color: var(--aix-colorFillTertiary);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;

    &:hover {
      border-color: var(--aix-colorPrimaryBorder);
      color: var(--aix-colorPrimary);
    }
  }
}

/* 回链临时高亮（quoteHighlight.ts 挂载）：子范围高亮层 + 整气泡淡出，两种形态样式各自独立 */
.aix-quote-highlight {
  position: absolute;
  z-index: 1;
  animation: aix-quote-fade-bg 2s var(--aix-motionEaseInOut) forwards;
  border-radius: var(--aix-borderRadiusXS);
  background-color: var(--aix-colorPrimaryBg);
  pointer-events: none;
  mix-blend-mode: multiply;
}

.aix-quote-highlight-fade {
  animation: aix-quote-fade 2s var(--aix-motionEaseInOut) forwards;
}

/* 子范围高亮：纯背景淡出，不描边，避免长文本 getClientRects 多矩形逐个描边出现一堆框 */
@keyframes aix-quote-fade-bg {
  0%,
  60% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

/* 整气泡降级形态：保留描边脉冲，视觉上区别于纯背景高亮 */
@keyframes aix-quote-fade {
  0%,
  60% {
    opacity: 1;
    box-shadow: 0 0 0 2px var(--aix-colorPrimaryBorder, var(--aix-colorPrimary));
  }

  100% {
    opacity: 0.999; /* 整气泡形态保持可见，仅描边淡出；高亮层由 JS 定时移除 */
    box-shadow: none;
  }
}
</style>
