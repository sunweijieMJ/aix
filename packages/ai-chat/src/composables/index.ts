// 注意：useNamespace 是包内私有 BEM 工具（前缀硬编码 aix-），不对外导出，
// 组件经 '../composables/useNamespace' 直接 import 使用。
export { xStream, useXStream } from './useXStream';
export { useChat } from './useChat';
export type { UseChatOptions, UseChatReturn, UseChatRequestCtx } from './useChat';
export { useTypewriter } from './useTypewriter';
export type { TypewriterOptions } from './useTypewriter';
export { useAutoScroll, defaultShouldFollow } from './useAutoScroll';
export type { ScrollState, FollowReason, FollowContext, ShouldFollow } from './useAutoScroll';
export { loadMarkdownRenderer } from './useMarkdownRenderer';
export type { MarkdownRenderFn } from './useMarkdownRenderer';
export { provideAiChatConfig, useAiChatConfig, AI_CHAT_CONFIG_KEY } from './useAiChatConfig';
export type { AiChatConfig } from './useAiChatConfig';
export { useConversations, localStorageConversationStorage } from './useConversations';
export type {
  ConversationStorage,
  UseConversationsOptions,
  UseConversationsReturn,
} from './useConversations';
