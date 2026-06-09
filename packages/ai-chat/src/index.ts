import type { App } from 'vue';

import AttachmentCard from './components/AttachmentCard.vue';
import Bubble from './components/Bubble.vue';
import BubbleList from './components/BubbleList.vue';
import BubbleActions from './components/BubbleActions.vue';
import Sender from './components/Sender.vue';
import Welcome from './components/Welcome.vue';
import Prompts from './components/Prompts.vue';
import Thinking from './components/Thinking.vue';
import ThoughtChain from './components/ThoughtChain.vue';
import ModelSelector from './components/ModelSelector.vue';
import MarkdownRenderer from './components/MarkdownRenderer.vue';
import TextBlock from './components/blocks/TextBlock.vue';
import ReasoningBlock from './components/blocks/ReasoningBlock.vue';
import ThoughtChainBlock from './components/blocks/ThoughtChainBlock.vue';
import SourcesBlock from './components/blocks/SourcesBlock.vue';
import AttachmentBlock from './components/blocks/AttachmentBlock.vue';
import AiChat from './components/AiChat.vue';
import Conversations from './components/Conversations.vue';
import Skeleton from './components/Skeleton.vue';

// 组件（不带 Aix 前缀）
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
  TextBlock,
  ReasoningBlock,
  ThoughtChainBlock,
  SourcesBlock,
  AttachmentBlock,
  AiChat,
  Conversations,
  Skeleton,
};

// composables
export * from './composables';

// SSE parseChunk 工厂与内置预设（扁平 / OpenAI 兼容）
export {
  createParseChunk,
  flatParseChunk,
  openaiParseChunk,
  anthropicParseChunk,
} from './utils/parsers';
export type { CreateParseChunkOptions } from './utils/parsers';

// 带中间件 / 超时的 fetch 包装（鉴权注入、响应校验、超时复用）
export { createXFetch } from './utils/x-fetch';
export type { XFetch, OnRequest, OnResponse, OnError, CreateXFetchOptions } from './utils/x-fetch';

// 流式 Markdown 防闪烁 / 数学定界符归一化工具
export { protectStreamingMarkdown, normalizeMathDelimiters } from './utils/markdown';

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
  textMessage,
  createMessage,
  messageText,
} from './utils/helpers';

// 共享类型（含 ChatMessage / BubbleProps / RoleConfig / PromptItem / ContentBlock / SourceItem / BlockBase 等）
export * from './types';
// 组件专属 Props/Emits（定义在各组件 .vue 内）
export type { BubbleEmits } from './components/Bubble.vue';
export type { BubbleActionsProps, BubbleActionsEmits } from './components/BubbleActions.vue';
export type { SenderProps, SenderEmits } from './components/Sender.vue';
export type { BubbleListProps, BubbleListEmits } from './components/BubbleList.vue';
export type { AiChatProps, AiChatEmits } from './components/AiChat.vue';
export type { WelcomeProps } from './components/Welcome.vue';
export type { ThinkingProps } from './components/Thinking.vue';
export type { ThoughtChainProps } from './components/ThoughtChain.vue';
export type { ModelSelectorProps } from './components/ModelSelector.vue';
export type { MarkdownRendererProps } from './components/MarkdownRenderer.vue';
export type { SkeletonProps } from './components/Skeleton.vue';
export type { TextBlockProps } from './components/blocks/TextBlock.vue';
export type { ReasoningBlockProps } from './components/blocks/ReasoningBlock.vue';
export type { ThoughtChainBlockProps } from './components/blocks/ThoughtChainBlock.vue';
export type { SourcesBlockProps } from './components/blocks/SourcesBlock.vue';
export type { AttachmentBlockProps } from './components/blocks/AttachmentBlock.vue';
export type { ConversationsProps, ConversationsEmits } from './components/Conversations.vue';
export type {
  AttachmentCardProps,
  AttachmentCardEmits,
  AttachmentCardItem,
} from './components/AttachmentCard.vue';

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
  TextBlock,
  ReasoningBlock,
  ThoughtChainBlock,
  SourcesBlock,
  AttachmentBlock,
  AiChat,
  Conversations,
  Skeleton,
};

// 插件：全局注册时加 Aix 前缀
export default {
  install(app: App) {
    for (const [name, comp] of Object.entries(components)) {
      app.component(`Aix${name}`, comp);
    }
  },
};
