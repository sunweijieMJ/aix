/**
 * @fileoverview Chat Vue 特有类型定义
 * 核心类型从 @aix/chat-sdk 重新导出
 */

import type {
  ChatMessage,
  MessageContent,
  StorageAdapter,
  OverflowStrategy,
  BatchUpdateItem,
  MessageRole,
} from '@aix/chat-sdk';
import type { Ref, VNode, Component, UnwrapNestedRefs, ComputedRef } from 'vue';
import type { UseXAgentReturn } from './agent';

// 重新导出 SDK 类型供外部使用
export type { StorageAdapter, OverflowStrategy, BatchUpdateItem };

/**
 * 解析后的消息类型
 * 类似于 ant-design/x 的 parsedMessages
 */
export interface ParsedMessage<T = unknown> {
  /** 原始消息 ID（可能有后缀，如 msg_1_0, msg_1_1） */
  id: string | number;
  /** 解析后的消息内容 */
  message: T;
  /** 消息状态 */
  status: ChatMessage['status'];
  /** 原始消息引用 */
  originalMessage?: ChatMessage;
}

/**
 * 消息解析器函数类型
 * 将原始 ChatMessage 转换为一个或多个展示用消息
 */
export type MessageParser<T = unknown> = (message: ChatMessage) => T | T[];

/**
 * 占位消息配置（Vue 扩展版本，支持 VNode/Component）
 */
export interface PlaceholderConfig {
  /** 占位内容（支持字符串、VNode 或组件） */
  content: MessageContent | VNode | Component;
  /** 占位图标 */
  icon?: VNode | Component | string;
}

/**
 * 回退消息配置（Vue 扩展版本，支持 VNode/Component）
 */
export interface FallbackConfig {
  /** 回退内容（支持字符串、VNode 或组件） */
  content: MessageContent | VNode | Component;
  /** 回退图标 */
  icon?: VNode | Component | string;
}

/**
 * useXChat 配置选项
 */
export interface UseXChatOptions {
  /**
   * 会话 Key（用于多会话隔离）
   * 相同 conversationKey 的 useXChat 将共享同一个 ChatStore
   * @default 'default'
   */
  conversationKey?: string;
  /**
   * 是否使用共享的 ChatStoreManager
   * - true: 使用全局 ChatStoreManager，支持跨组件共享会话
   * - false: 创建独立的 ChatStore 实例
   * @default false
   */
  shared?: boolean;
  /** Agent 实例（可选，仅数据管理时不需要） */
  agent?: UseXAgentReturn;
  /** 初始消息列表 */
  defaultMessages?: ChatMessage[];
  /** 最大消息数量限制 */
  maxMessages?: number;
  /** 达到消息限制时的策略 */
  overflow?: OverflowStrategy;
  /** 持久化存储适配器 */
  storage?: StorageAdapter;
  /** 存储键名 */
  storageKey?: string;
  /** 消息发送前拦截器 */
  onRequest?: (message: string) => boolean | Promise<boolean>;
  /** 消息接收后处理 */
  onResponse?: (message: ChatMessage) => void;
  /** 错误处理回调 */
  onError?: (error: Error) => void;
  /** 加载中占位配置（Vue 层配置，用于 UI 展示） */
  placeholder?: PlaceholderConfig | string;
  /** 错误/空内容回退配置（Vue 层配置，用于 UI 展示） */
  fallback?: FallbackConfig | string;
  /**
   * 消息解析器
   * 将原始 ChatMessage 转换为展示用的格式
   * 类似于 ant-design/x 的 parser
   * @example
   * ```ts
   * // 将 Markdown 消息拆分为多个块
   * parser: (msg) => {
   *   const parts = msg.content.split('---');
   *   return parts.map(p => ({ type: 'text', content: p }));
   * }
   * ```
   */
  parser?: MessageParser;
}

/**
 * useXChat 返回值
 */
export interface UseXChatReturn {
  /** 消息列表（响应式） - 使用 reactive 数组以支持流式更新 */
  messages: UnwrapNestedRefs<ChatMessage[]>;
  /**
   * 解析后的消息列表（响应式计算属性）
   * 类似于 ant-design/x 的 parsedMessages
   * 当配置了 parser 时，返回解析后的消息；否则返回原始消息的包装
   */
  parsedMessages: ComputedRef<ParsedMessage[]>;
  /** 发送消息 */
  onRequest: (message: string) => Promise<void>;
  /** 加载状态 */
  isLoading: Ref<boolean>;
  /** 占位配置（响应式） */
  placeholderConfig: Ref<PlaceholderConfig | string | undefined>;
  /** 回退配置（响应式） */
  fallbackConfig: Ref<FallbackConfig | string | undefined>;

  // ==========================================================================
  // 基础操作
  // ==========================================================================

  /** 清空消息 */
  clear: () => void;
  /** 停止生成 */
  stop: () => void;
  /** 删除指定消息 */
  deleteMessage: (id: string) => boolean;
  /** 批量删除消息 */
  deleteMessages: (ids: string[]) => number;
  /** 重新生成最后一条 AI 消息 */
  regenerate: () => Promise<void>;
  /** 更新消息内容 */
  updateMessage: (id: string, content: string) => boolean;
  /** 批量更新消息 */
  batchUpdate: (updates: BatchUpdateItem[]) => number;
  /** 添加消息 */
  addMessage: (
    message: Omit<ChatMessage, 'id' | 'createAt' | 'updateAt'>,
  ) => ChatMessage;
  /** 在指定位置插入消息 */
  insertMessage: (
    message: Omit<ChatMessage, 'id' | 'createAt' | 'updateAt'>,
    index?: number,
  ) => ChatMessage;
  /** 手动重试 */
  retry: () => Promise<void>;
  /** 重新加载指定的 AI 消息（类似 ant-design/x 的 onReload） */
  onReload: (messageId: string) => Promise<boolean>;
  /** 回复消息 */
  replyToMessage: (messageId: string, content: string) => Promise<void>;

  // ==========================================================================
  // 查询方法
  // ==========================================================================

  /** 根据 ID 获取消息 */
  getMessageById: (id: string) => ChatMessage | undefined;
  /** 获取指定角色的所有消息 */
  getMessagesByRole: (role: MessageRole) => ChatMessage[];
  /** 获取最后一条消息 */
  getLastMessage: () => ChatMessage | undefined;
  /** 获取最后一条 AI 消息 */
  getLastAssistantMessage: () => ChatMessage | undefined;
  /** 获取最后一条用户消息 */
  getLastUserMessage: () => ChatMessage | undefined;
  /** 搜索消息 */
  searchMessages: (keyword: string) => ChatMessage[];

  // ==========================================================================
  // 统计方法
  // ==========================================================================

  /** 获取消息总数 */
  getMessageCount: () => number;
  /** 获取指定角色的消息数 */
  getMessageCountByRole: (role: MessageRole) => number;
  /** 检查是否为空 */
  isEmpty: () => boolean;

  // ==========================================================================
  // 快照和序列化
  // ==========================================================================

  /** 创建消息快照 */
  snapshot: () => ChatMessage[];
  /** 从快照恢复消息 */
  restore: (messages: ChatMessage[]) => void;
  /** 导出消息 */
  exportMessages: (format: 'json' | 'markdown' | 'text') => string;

  // ==========================================================================
  // 持久化
  // ==========================================================================

  /** 从存储加载消息 */
  loadMessages: () => Promise<boolean>;
  /** 保存消息到存储 */
  saveMessages: () => Promise<boolean>;
  /** 清除存储的消息 */
  clearStorage: () => Promise<boolean>;

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  /** 获取最大消息数配置 */
  getMaxMessages: () => number | undefined;
  /** 设置最大消息数 */
  setMaxMessages: (max: number | undefined) => void;
}
