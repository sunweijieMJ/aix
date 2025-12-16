/**
 * @fileoverview ChatProvider 类型定义
 * 使用 Provide/Inject 实现跨组件通信，无需额外状态管理库
 */

import type { ChatMessage } from '@aix/chat-sdk';
import type { InjectionKey, Ref } from 'vue';
import type {
  UseXChatReturn,
  AgentRequestParams,
  AgentStreamCallbacks,
} from '../../types';

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 初始延迟（毫秒） */
  initialDelay?: number;
  /** 最大延迟（毫秒） */
  maxDelay?: number;
  /** 是否使用指数退避 */
  exponentialBackoff?: boolean;
  /** 重试回调 */
  onRetry?: (retryCount: number, delay: number) => void;
}

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 会话ID */
  id: string;
  /** 会话标题 */
  title?: string;
  /**
   * Agent 请求函数（OpenAI 兼容）
   * @param params - 请求参数
   * @param callbacks - 流式回调
   */
  request?: (
    params: AgentRequestParams,
    callbacks?: AgentStreamCallbacks,
  ) => Promise<string | void>;
  /** 是否启用流式传输 */
  stream?: boolean;
  /** 重试配置 */
  retry?: RetryConfig;
}

/**
 * UI 显示配置
 */
export interface UIConfig {
  /** 是否显示头像 */
  showAvatar?: boolean;
  /** 是否显示时间戳 */
  showTimestamp?: boolean;
  /** 是否显示操作按钮 */
  showActions?: boolean;
  /** 是否显示工具调用 */
  showToolCalls?: boolean;
  /** 是否显示建议 */
  showSuggestions?: boolean;
  /** 是否显示欢迎屏 */
  showWelcome?: boolean;
  /** 是否启用 Markdown */
  enableMarkdown?: boolean;
  /** 是否启用语音输入 */
  enableSpeech?: boolean;
  /** 是否启用文件上传 */
  enableFileUpload?: boolean;
  /** 是否启用复制 */
  enableCopy?: boolean;
  /** 是否启用重新生成 */
  enableRegenerate?: boolean;
  /** 是否自动滚动 */
  autoScroll?: boolean;
}

/**
 * ChatProvider 上下文
 */
export interface ChatProviderContext {
  /** 当前会话ID */
  currentSessionId: Ref<string>;
  /** 当前会话的消息列表 */
  messages: Ref<ChatMessage[]>;
  /** 是否正在加载 */
  isLoading: Ref<boolean>;
  /** UI 配置 */
  uiConfig: Ref<UIConfig>;

  // 会话管理
  /** 创建新会话 */
  createSession: (config: SessionConfig) => void;
  /** 切换会话 */
  switchSession: (sessionId: string) => boolean;
  /** 删除会话 */
  deleteSession: (sessionId: string) => Promise<void>;
  /** 获取会话实例 */
  getSession: (sessionId: string) => UseXChatReturn | undefined;

  // 消息操作
  /** 发送消息 */
  sendMessage: (content: string) => Promise<void>;
  /** 停止生成 */
  stopGeneration: () => void;
  /** 清空消息 */
  clearMessages: () => void;
  /** 重新生成最后一条 AI 消息 */
  regenerate: () => Promise<void>;
  /** 删除消息 */
  deleteMessage: (messageId: string) => void;
  /** 添加消息（不触发 AI 响应） */
  addMessage: (
    message: Omit<ChatMessage, 'id' | 'createAt' | 'updateAt'>,
  ) => ChatMessage | undefined;

  // UI 配置
  /** 更新 UI 配置 */
  updateUIConfig: (config: Partial<UIConfig>) => void;
}

/**
 * ChatProvider 组件 Props
 */
export interface ChatProviderProps {
  /** 初始会话配置 */
  initialSession?: SessionConfig;
  /** UI 配置 */
  uiConfig?: UIConfig;
  /**
   * 默认 API 请求函数（OpenAI 兼容）
   * @param params - 请求参数
   * @param callbacks - 流式回调
   */
  defaultRequest?: (
    params: AgentRequestParams,
    callbacks?: AgentStreamCallbacks,
  ) => Promise<string | void>;
  /**
   * 默认重试配置
   * 当请求失败时自动重试
   */
  defaultRetry?: RetryConfig;
}

/**
 * Injection Key
 */
export const CHAT_PROVIDER_KEY: InjectionKey<ChatProviderContext> =
  Symbol('chat-provider');
