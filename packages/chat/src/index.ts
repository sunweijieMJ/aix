/**
 * @fileoverview @aix/chat 统一导出
 * AI Chat 组件库 - 基于 @ant-design/x 设计理念的 Vue 3 实现
 *
 * 注意: 本包不再重导出 @aix/chat-sdk 和 @aix/chat-ui 的内容
 * 如需使用 SDK 能力，请直接从 @aix/chat-sdk 导入
 * 如需使用内容渲染能力，请直接从 @aix/chat-ui 导入
 */

// ========== 样式 ==========
import './styles/index.scss';

// ========== 类型导出 ==========
export * from './types';

// ========== 快捷键工具函数 ==========
export {
  MODIFIER_KEYS,
  matchShortcut,
  formatShortcut,
  createShortcutHandler,
} from './types/shortcut';

// ========== 核心 Composables ==========
export { useXChat } from './composables/useXChat';
export { useXAgent } from './composables/useXAgent';

// ========== 全局配置 ==========
export {
  useGlobalConfig,
  useComponentConfig,
  useMergedConfig,
} from './composables/useGlobalConfig';

// ========== 多会话管理 ==========
export { useChatStore, tryUseChatStore } from './composables/useChatStore';

// ========== 辅助 Composables ==========
export { useRetry, retryFetch } from './composables/useRetry';
export { useErrorHandler } from './composables/useErrorHandler';
export { useFileUpload, FileType } from './composables/useFileUpload';
export { useSpeechInput } from './composables/useSpeechInput';
// 注意: ErrorType, ErrorLevel 请从 @aix/chat-sdk 导入

// ========== Composables 类型 ==========
// UseXChatOptions, UseXChatReturn, UseXAgentOptions, UseXAgentReturn 已从 './types' 导出
export type {
  RetryConfig,
  RetryState,
  RetryResult,
} from './composables/useRetry';
export type { ErrorHandlerResult } from './composables/useErrorHandler';
// 注意: ErrorRecord, ErrorHandlerConfig 请从 @aix/chat-sdk 导入
export type {
  UploadedFile,
  UploadConfig,
  UseFileUploadReturn,
} from './composables/useFileUpload';
export type {
  SpeechConfig,
  UseSpeechInputOptions,
  UseSpeechInputReturn,
} from './composables/useSpeechInput';

// ========== Bubble 组件 ==========
export {
  default as Bubble,
  BubbleList,
  BubbleAvatar,
  BubbleContent,
  BubbleMarkdown,
  MultiModalContent,
  BubbleEditable,
  BubbleDivider,
  BubbleSystem,
  // Context API
  provideBubbleContext,
  useBubbleContext,
  BubbleContextKey,
  // 预设配置
  defaultRoles,
  minimalRoles,
  roundRoles,
  chatRoles,
  shadowRoles,
  compactRoles,
  createRolesConfig,
} from './components/Bubble';
export type {
  BubbleProps,
  BubbleListProps,
  BubbleAvatarProps,
  BubbleContentProps,
  BubbleTypingOption,
  BubbleShape,
  BubbleEditableConfig,
  BubbleDividerProps,
  BubbleDividerType,
  BubbleSystemProps,
  BubbleSystemEmits,
  BubbleSystemType,
  RoleConfig,
  RoleConfigFunction,
  RolesConfig,
  BubbleAnimationType,
  BubbleAnimationConfig,
  BubbleGroupConfig,
  BubbleContextValue,
  CreateBubbleContextOptions,
} from './components/Bubble';

// ========== Sender 组件 ==========
export { default as Sender, SenderHeader } from './components/Sender';
export type {
  SenderProps,
  SenderEmits,
  ModelOption,
  SubmitType,
  SlotConfigType,
  TextSlotConfig,
  InputSlotConfig,
  SelectSlotConfig,
  TagSlotConfig,
  CustomSlotConfig,
  SlotValues,
  SkillConfig,
  SenderHeaderProps,
  SenderHeaderEmits,
  SenderHeaderExpandDirection,
  SenderHeaderExpandTrigger,
} from './components/Sender';

// ========== Prompts 组件 ==========
export { default as Prompts } from './components/Prompts';
export type {
  PromptsProps,
  PromptsEmits,
  PromptItem,
} from './components/Prompts';

// ========== Conversations 组件 ==========
export { default as Conversations } from './components/Conversations';
export type {
  ConversationsProps,
  ConversationsEmits,
  ConversationItem,
} from './components/Conversations';

// ========== Welcome 组件 ==========
export { default as Welcome } from './components/Welcome';
export type {
  WelcomeProps,
  WelcomeEmits,
  WelcomeFeature,
} from './components/Welcome';

// ========== Attachments 组件 ==========
export { default as Attachments } from './components/Attachments';
export type {
  AttachmentsProps,
  AttachmentsEmits,
  AttachmentItem,
} from './components/Attachments';

// ========== ThoughtChain 组件 ==========
export { default as ThoughtChain } from './components/ThoughtChain';
export type {
  ThoughtChainProps,
  ThoughtChainEmits,
  ThoughtStep,
  ThoughtStepType,
} from './components/ThoughtChain';

// ========== Think 组件 ==========
export { default as Think } from './components/Think';
export type { ThinkProps, ThinkEmits, ThinkStatus } from './components/Think';

// ========== Suggestion 组件 ==========
export { default as Suggestion } from './components/Suggestion';
export type {
  SuggestionProps,
  SuggestionEmits,
  SuggestionItem,
} from './components/Suggestion';

// ========== XProvider 组件 ==========
export { default as XProvider, X_PROVIDER_KEY } from './components/XProvider';
export type { XProviderProps, XProviderConfig } from './components/XProvider';

// ========== ErrorBoundary 组件 ==========
export { default as ErrorBoundary } from './components/ErrorBoundary';
export type {
  ErrorBoundaryProps,
  ErrorBoundaryEmits,
} from './components/ErrorBoundary';

// ========== FilePreview 组件 ==========
export { default as FilePreview } from './components/FilePreview';

// ========== Actions 组件 ==========
export {
  default as Actions,
  ActionCopy,
  ActionFeedback,
} from './components/Actions';
export type {
  ActionsProps,
  ActionsEmits,
  ActionItem,
  ActionVariant,
  ActionStatus,
  FeedbackValue,
  ActionCopyProps,
  ActionCopyEmits,
  ActionFeedbackProps,
  ActionFeedbackEmits,
} from './components/Actions';

// ========== Sources 组件 ==========
export { default as Sources, SourceItem } from './components/Sources';
export type {
  SourcesProps,
  SourcesEmits,
  SourceItemType,
  SourceItemProps,
  SourceItemEmits,
} from './components/Sources';

// ========== AgentActions 组件 ==========
export { default as AgentActions } from './components/AgentActions';
export type {
  AgentActionsProps,
  AgentActionsEmits,
  AgentAction,
} from './components/AgentActions';

// ========== ToolCall 组件 ==========
export { ToolCallUI, ToolCallList } from './components/ToolCall';
export type { ToolCallUIProps, ToolCallListProps } from './components/ToolCall';

// ========== ChatProvider 组件 ==========
export { default as ChatProvider } from './components/ChatProvider/index.vue';
export { CHAT_PROVIDER_KEY } from './components/ChatProvider/types';
export type {
  ChatProviderProps,
  ChatProviderContext,
  SessionConfig,
  UIConfig,
} from './components/ChatProvider/types';

// ========== AIChatWidget 组件 ==========
export { default as AIChatWidget } from './components/AIChatWidget/index.vue';
export type {
  AIChatWidgetProps,
  AIChatWidgetEmits,
  SessionInfo,
} from './components/AIChatWidget/types';

// ========== 国际化 ==========
export { chatLocale, zhCN as chatZhCN, enUS as chatEnUS } from './locale';
export type { ChatLocale } from './locale';

// ========== API 适配器 ==========
export { createDifyAgent, DifyUtils } from './adapters/difyAdapter';
export type { DifyConfig, DifyMessageParams } from './adapters/difyAdapter';

// ========== 版本信息 ==========
export const version = '1.0.0';
