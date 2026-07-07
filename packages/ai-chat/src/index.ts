import type { App } from 'vue';
import AiChat from './components/AiChat.vue';
import AttachmentCard from './components/AttachmentCard.vue';
import Bubble from './components/Bubble.vue';
import BubbleActions from './components/BubbleActions.vue';
import BubbleList from './components/BubbleList.vue';
import Conversations from './components/Conversations.vue';
import MarkdownRenderer from './components/MarkdownRenderer.vue';
import ModelSelector from './components/ModelSelector.vue';
import Prompts from './components/Prompts.vue';
import QuoteSheet from './components/quote/QuoteSheet.vue';
import QuoteToolbar from './components/quote/QuoteToolbar.vue';
import QuoteChip from './components/QuoteChip.vue';
import QuoteMenu from './components/QuoteMenu.vue';
import Sender from './components/Sender.vue';
import Skeleton from './components/Skeleton.vue';
import Suggestions from './components/Suggestions.vue';
import Thinking from './components/Thinking.vue';
import ThoughtChain from './components/ThoughtChain.vue';
import TriggerMenu from './components/TriggerMenu.vue';
import Welcome from './components/Welcome.vue';

// 组件（不带 Aix 前缀）
// 注意：内置内容块组件（TextBlock / ReasoningBlock / ThoughtChainBlock / SourcesBlock /
// AttachmentBlock）是 Bubble 块注册表的实现细节，不对外导出——扩展请通过 blockRenderers 注册自定义渲染器。
export {
  AttachmentCard,
  Bubble,
  BubbleList,
  BubbleActions,
  Sender,
  Welcome,
  Prompts,
  Thinking,
  ThoughtChain,
  ModelSelector,
  MarkdownRenderer,
  AiChat,
  Conversations,
  Skeleton,
  QuoteMenu,
  QuoteChip,
  TriggerMenu,
  Suggestions,
};

// 划词引用默认皮肤（toolbar/sheet 单端换肤时作为 fallback/对照参考，见 QuoteMenuProps.toolbar/sheet）
export { QuoteToolbar, QuoteSheet };

// composables
export * from './composables';

// 触发菜单（@提及 / 斜杠命令）L1 检测状态托管：纯状态、无 DOM 副作用，供自定义触发 UI 复用同一检测逻辑
export { useTriggerDetect } from './composables/useTriggerDetect';

// 触发菜单：反向扫描检测算法与位置解析规则（position 缺省规则），供自定义触发 UI / 单测复用
export { detectTrigger, resolvePosition } from './utils/triggerDetect';
export type { TriggerDetection } from './utils/triggerDetect';

// 触发菜单：textarea 内指定下标字符的视口坐标测量（@ 锚点定位的镜像 div 测量法），供自定义菜单实现复用
export { getCaretRect } from './utils/caretRect';

// SSE parseChunk 工厂与内置预设（扁平 / OpenAI 兼容）
export {
  createParseChunk,
  flatParseChunk,
  openaiParseChunk,
  anthropicParseChunk,
} from './utils/parsers';
export type { CreateParseChunkOptions } from './utils/parsers';

// 工具调用（tool_use）纯 reducer：把 ToolEventDelta 并入消息内容块，供自定义协议接入复用
export { applyToolEvent, type ToolReduceCtx } from './utils/toolBlocks';

// 带中间件 / 超时的 fetch 包装（鉴权注入、响应校验、超时复用）
export { createXFetch } from './utils/x-fetch';
export type { XFetch, OnRequest, OnResponse, OnError, CreateXFetchOptions } from './utils/x-fetch';

// OpenAI 兼容流式请求便利工厂（配合 openaiParseChunk，降低接入门槛；仍保持协议无关性）
export { createOpenAIRequest } from './utils/openai';
export type {
  CreateOpenAIRequestOptions,
  OpenAIChatParams,
  OpenAIChatMessage,
} from './utils/openai';

// 流式 Markdown 防闪烁 / 数学定界符归一化工具
export { protectStreamingMarkdown, normalizeMathDelimiters } from './utils/markdown';

// 朗读文本提取（markdown→纯文本，供自定义 getText 复用）
export { stripMarkdownForSpeech } from './utils/stripMarkdownForSpeech';

// URL 安全工具（协议白名单，供数据驱动的 href 场景复用）
export { safeUrl } from './utils/url';

// 自定义 markdown 渲染器（用于 AiChat / MarkdownRenderer 的 markdownRenderers 扩展点）
export type {
  MarkdownRenderers,
  MarkdownRenderer as MarkdownRendererFn,
  MarkdownRenderContext,
  MarkdownRenderInfo,
  MdToken,
} from './utils/markdownWalker';

// markdown-it 插件注入类型（用于 AiChat / MarkdownRenderer 的 mdPlugins 扩展点，注入新语法）
export type { MarkdownItPlugin } from './composables/useMarkdownRenderer';

// content block 构造/提取 helpers
export {
  genBlockId,
  genMsgId,
  textBlock,
  reasoningBlock,
  sourcesBlock,
  thoughtChainBlock,
  attachmentBlock,
  chartBlock,
  textMessage,
  createMessage,
  messageText,
  quoteBlock,
  genQuoteId,
  normalizeSuggestions,
} from './utils/helpers';

// 划词引用：默认 quote → prompt 拼装 / 消息内 quote 提取工具（供自定义 toPrompt / 消息渲染复用）
export { defaultQuoteToPrompt, flattenQuoteBlocks, getQuotes } from './utils/quotePrompt';
// 划词引用：锚点去重 + 意图更新纯函数（AiChat 内部 insertQuote 复用，供自定义引用入口复用同一策略）
export { upsertQuote } from './utils/quoteDedupe';

// 共享类型（含 ChatMessage / BubbleProps / RoleConfig / PromptItem / ContentBlock / SourceItem / BlockBase 等）
export * from './types';
// 组件专属 Props/Emits（定义在各组件 .vue 内）
export type { BubbleEmits } from './components/Bubble.vue';
export type { BubbleActionsProps, BubbleActionsEmits } from './components/BubbleActions.vue';
export type {
  SenderProps,
  SenderEmits,
  SenderSlotScope,
  ToolbarBuiltinKey,
  ToolbarItem,
  SenderToolbarItems,
} from './components/Sender.vue';
export type { BubbleListProps, BubbleListEmits } from './components/BubbleList.vue';
export type { AiChatProps, AiChatEmits } from './components/AiChat.vue';
export type { WelcomeProps } from './components/Welcome.vue';
export type { ThinkingProps } from './components/Thinking.vue';
export type { ThoughtChainProps } from './components/ThoughtChain.vue';
export type { ModelSelectorProps } from './components/ModelSelector.vue';
export type { MarkdownRendererProps } from './components/MarkdownRenderer.vue';
export type { SkeletonProps } from './components/Skeleton.vue';
export type { ConversationsProps, ConversationsEmits } from './components/Conversations.vue';
export type {
  AttachmentCardProps,
  AttachmentCardEmits,
  AttachmentCardItem,
} from './components/AttachmentCard.vue';
export type { QuoteMenuProps, QuoteMenuEmits } from './components/QuoteMenu.vue';
export type { QuoteChipProps, QuoteChipEmits } from './components/QuoteChip.vue';
export type { QuoteToolbarProps, QuoteToolbarEmits } from './components/quote/QuoteToolbar.vue';
export type { QuoteSheetProps, QuoteSheetEmits } from './components/quote/QuoteSheet.vue';
export type { TriggerMenuProps, TriggerMenuEmits } from './components/TriggerMenu.vue';
export type { SuggestionsProps, SuggestionsEmits } from './components/Suggestions.vue';

// locale
export { locale as aiChatLocale, zhCN, enUS } from './locale';
export type { AiChatLocale } from './locale';

const components = {
  AttachmentCard,
  Bubble,
  BubbleList,
  BubbleActions,
  Sender,
  Welcome,
  Prompts,
  Thinking,
  ThoughtChain,
  ModelSelector,
  MarkdownRenderer,
  AiChat,
  Conversations,
  Skeleton,
  QuoteMenu,
  QuoteChip,
  TriggerMenu,
  Suggestions,
};

// 插件：全局注册时加 Aix 前缀
export default {
  install(app: App) {
    for (const [name, comp] of Object.entries(components)) {
      app.component(`Aix${name}`, comp);
    }
  },
};
