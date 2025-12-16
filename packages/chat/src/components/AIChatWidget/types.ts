/**
 * @fileoverview AIChatWidget 类型定义
 * 完整的 AI 对话组件
 */

import type { ChatMessage } from '@aix/chat-sdk';
import type { AgentRequestParams, AgentStreamCallbacks } from '../../types';
import type { UIConfig } from '../ChatProvider/types';
import type { SuggestionItem } from '../Suggestion/types';
import type { WelcomeFeature } from '../Welcome/types';

/**
 * AIChatWidget 组件 Props
 */
export interface AIChatWidgetProps {
  // ========== 必需配置 ==========
  /**
   * API 请求函数（OpenAI 兼容）
   * @param params - 请求参数，包含 messages, model, stream 等
   * @param callbacks - 流式回调（可选）
   * @returns 非流式时返回完整响应，流式时通过 callbacks 返回
   */
  apiRequest: (
    params: AgentRequestParams,
    callbacks?: AgentStreamCallbacks,
  ) => Promise<string | void>;

  // ========== 显示控制 ==========
  /** 是否显示侧边栏（会话列表） */
  showSidebar?: boolean;
  /** 是否显示顶部工具栏 */
  showHeader?: boolean;
  /** 是否显示欢迎屏（无消息时） */
  showWelcome?: boolean;
  /** 是否显示建议提示 */
  showSuggestions?: boolean;

  // ========== 初始化配置 ==========
  /** 初始会话ID */
  initialSessionId?: string;
  /** UI 配置 */
  uiConfig?: Partial<UIConfig>;

  // ========== 存储配置 ==========
  /**
   * 会话存储 key
   * 设置为 false 禁用会话存储
   * @default 'aix_chat_widget_sessions'
   */
  storageKey?: string | false;

  // ========== 内容配置 ==========
  /** 欢迎屏配置 */
  welcomeConfig?: {
    title?: string;
    description?: string;
    features?: WelcomeFeature[];
  };
  /** 建议列表 */
  suggestions?: SuggestionItem[];
  /** 输入框占位符 */
  placeholder?: string;

  // ========== 样式配置 ==========
  /** 自定义类名 */
  className?: string;
  /** 侧边栏宽度 */
  sidebarWidth?: string;
}

/**
 * AIChatWidget 事件
 */
export interface AIChatWidgetEmits {
  /** 会话切换 */
  (e: 'session-change', sessionId: string): void;
  /** 消息发送 */
  (e: 'message-sent', message: string): void;
  /** 消息接收 */
  (e: 'message-received', message: ChatMessage): void;
  /** 建议选择 */
  (e: 'suggestion-select', item: SuggestionItem): void;
  /** 欢迎屏功能点击 */
  (e: 'welcome-feature', feature: WelcomeFeature): void;
  /** 消息清空 */
  (e: 'messages-cleared'): void;
  /** 错误 */
  (e: 'error', error: Error): void;
}

/**
 * 会话信息（用于侧边栏展示）
 */
export interface SessionInfo {
  id: string;
  title: string;
  description?: string;
  timestamp?: number;
  active?: boolean;
}
