/**
 * @fileoverview 类型定义统一导出
 *
 * 注意: 本包不再重导出 @aix/chat-sdk 和 @aix/chat-ui 的内容
 * 如需使用 SDK 类型，请直接从 @aix/chat-sdk 导入
 * 如需使用 UI 类型，请直接从 @aix/chat-ui 导入
 */

// ========== Vue Composables 类型 ==========
export type { UseXAgentOptions, UseXAgentReturn } from './agent';
export type {
  PlaceholderConfig,
  FallbackConfig,
  UseXChatOptions,
  UseXChatReturn,
  ParsedMessage,
  MessageParser,
} from './chat';

// ========== Actions 类型 ==========
export * from './action';

// ========== 快捷键类型 ==========
export * from './shortcut';

// ========== Chat 包特有类型 ==========

/**
 * Agent 请求参数（OpenAI 兼容）
 * messages 支持多模态内容（文本、图片等）
 */
export interface AgentRequestParams {
  messages: import('@aix/chat-sdk').OpenAIMessage[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Agent 流式回调
 */
export interface AgentStreamCallbacks {
  onUpdate?: (chunk: string) => void;
  onSuccess?: (content: string) => void;
  onError?: (error: Error) => void;
}
