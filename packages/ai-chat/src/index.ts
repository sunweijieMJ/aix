import type { App } from 'vue';

import Bubble from './components/Bubble.vue';
import BubbleList from './components/BubbleList.vue';
import BubbleActions from './components/BubbleActions.vue';
import Sender from './components/Sender.vue';
import Welcome from './components/Welcome.vue';
import Prompts from './components/Prompts.vue';
import Thinking from './components/Thinking.vue';
import ThoughtChain from './components/ThoughtChain.vue';
import ModelSelector from './components/ModelSelector.vue';
import ResultCard from './components/ResultCard.vue';
import MarkdownRenderer from './components/MarkdownRenderer.vue';
import TextBlock from './components/blocks/TextBlock.vue';
import ReasoningBlock from './components/blocks/ReasoningBlock.vue';
import ThoughtChainBlock from './components/blocks/ThoughtChainBlock.vue';
import SourcesBlock from './components/blocks/SourcesBlock.vue';
import ChoiceBlock from './components/blocks/ChoiceBlock.vue';
import AiChat from './components/AiChat.vue';
import Conversations from './components/Conversations.vue';

// 组件（不带 Aix 前缀）
export {
  Bubble,
  BubbleList,
  BubbleActions,
  Sender,
  Welcome,
  Prompts,
  Thinking,
  ThoughtChain,
  ModelSelector,
  ResultCard,
  MarkdownRenderer,
  TextBlock,
  ReasoningBlock,
  ThoughtChainBlock,
  SourcesBlock,
  ChoiceBlock,
  AiChat,
  Conversations,
};

// composables
export * from './composables';

// SSE parseChunk 工厂与内置预设（扁平 / OpenAI 兼容）
export { createParseChunk, flatParseChunk, openaiParseChunk } from './utils/parsers';
export type { CreateParseChunkOptions } from './utils/parsers';

// 带中间件 / 超时的 fetch 包装（鉴权注入、响应校验、超时复用）
export { createXFetch } from './utils/x-fetch';
export type { XFetch, XFetchMiddlewares, CreateXFetchOptions } from './utils/x-fetch';

// 流式 Markdown 防闪烁工具
export { protectStreamingMarkdown } from './utils/markdown';

// content block 构造/提取 helpers
export {
  genBlockId,
  genMsgId,
  textBlock,
  reasoningBlock,
  sourcesBlock,
  thoughtChainBlock,
  choiceBlock,
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
export type { ResultCardProps, ResultCardEmits } from './components/ResultCard.vue';
export type { MarkdownRendererProps } from './components/MarkdownRenderer.vue';
export type { TextBlockProps } from './components/blocks/TextBlock.vue';
export type { ReasoningBlockProps } from './components/blocks/ReasoningBlock.vue';
export type { ThoughtChainBlockProps } from './components/blocks/ThoughtChainBlock.vue';
export type { SourcesBlockProps } from './components/blocks/SourcesBlock.vue';
export type { ChoiceBlockProps } from './components/blocks/ChoiceBlock.vue';
export type { ConversationsProps, ConversationsEmits } from './components/Conversations.vue';

// locale
export { locale as aiChatLocale, zhCN, enUS } from './locale';
export type { AiChatLocale } from './locale';

const components = {
  Bubble,
  BubbleList,
  BubbleActions,
  Sender,
  Welcome,
  Prompts,
  Thinking,
  ThoughtChain,
  ModelSelector,
  ResultCard,
  MarkdownRenderer,
  TextBlock,
  ReasoningBlock,
  ThoughtChainBlock,
  SourcesBlock,
  ChoiceBlock,
  AiChat,
  Conversations,
};

// 插件：全局注册时加 Aix 前缀
export default {
  install(app: App) {
    for (const [name, comp] of Object.entries(components)) {
      app.component(`Aix${name}`, comp);
    }
  },
};
