/**
 * @fileoverview 消息相关类型定义
 * 参考 @ant-design/x 和 OpenAI 标准
 */

import type { ToolCall } from './tool-call';

/**
 * 消息角色（遵循 OpenAI 标准）
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 消息状态
 *
 * 状态流转：
 * - local: 用户刚发送，尚未发出请求
 * - loading: 正在请求 AI，显示占位符
 * - streaming: 流式接收中，内容正在更新
 * - success: 完成
 * - error: 错误
 * - cancelled: 用户主动取消
 *
 * 典型流程：
 * local → loading → streaming → success
 *                            → error
 *                            → cancelled
 */
export type MessageStatus =
  | 'local' // 本地消息，用户刚发送，尚未发出请求
  | 'loading' // 加载中，正在请求 AI，可显示占位符
  | 'streaming' // 流式接收中，内容正在更新
  | 'success' // 成功完成
  | 'error' // 发生错误
  | 'cancelled'; // 用户主动取消

/**
 * 检查消息是否处于活跃状态（正在处理中）
 */
export function isMessageActive(status: MessageStatus | undefined): boolean {
  return status === 'local' || status === 'loading' || status === 'streaming';
}

/**
 * 检查消息是否可重试
 */
export function isMessageRetryable(status: MessageStatus | undefined): boolean {
  return status === 'error' || status === 'cancelled';
}

/**
 * 文本内容类型
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * 图片内容类型
 */
export interface ImageContent {
  type: 'image_url';
  image_url: {
    /** 图片 URL 或 base64 数据 */
    url: string;
    /** 图片细节级别（OpenAI API） */
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * 文件内容类型
 */
export interface FileContent {
  type: 'file';
  file: {
    /** 文件 URL */
    url: string;
    /** 文件名 */
    name: string;
    /** 文件大小（字节） */
    size?: number;
    /** MIME 类型 */
    mimeType?: string;
  };
}

/**
 * 消息内容类型（支持多模态）
 */
export type ContentType = TextContent | ImageContent | FileContent;

/**
 * 消息内容（支持字符串或多模态内容数组）
 */
export type MessageContent = string | ContentType[];

/**
 * 消息元数据类型
 * 用于存储自定义扩展信息
 */
export type MessageMeta = Record<string, unknown>;

/**
 * 序列化的错误信息
 * 用于替代 Error 对象，支持 JSON 序列化和 structuredClone
 */
export interface SerializedError {
  /** 错误消息 */
  message: string;
  /** 错误名称 */
  name: string;
  /** 错误堆栈 */
  stack?: string;
  /** 错误代码（可选） */
  code?: string | number;
}

/**
 * 将 Error 对象转换为可序列化的格式
 */
export function serializeError(
  error: Error | SerializedError,
): SerializedError {
  // 使用 instanceof 检测原生 Error 对象
  if (!(error instanceof Error)) {
    // 已经是 SerializedError 格式，直接返回
    return error;
  }

  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
    code: (error as Error & { code?: string | number }).code,
  };
}

/**
 * 聊天消息接口（支持多模态）
 *
 * @template M 元数据类型，默认为 MessageMeta
 */
export interface ChatMessage<M extends MessageMeta = MessageMeta> {
  /** 消息唯一ID */
  id: string;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容（支持纯文本或多模态内容数组） */
  content: MessageContent;
  /** 创建时间戳 */
  createAt: number;
  /** 更新时间戳 */
  updateAt: number;
  /** 消息状态 */
  status?: MessageStatus;
  /** 错误信息（使用可序列化格式） */
  error?: SerializedError;
  /** Tool Calls（LLM 函数调用记录） */
  toolCalls?: ToolCall[];
  /** 元数据（扩展字段，可自定义类型） */
  meta?: M;
  /**
   * 额外信息（用于存储业务相关的附加数据）
   * 与 meta 不同的是，extraInfo 用于存储与渲染/展示相关的业务数据
   * meta 更多用于存储内部状态信息
   */
  extraInfo?: Record<string, unknown>;
}

/**
 * OpenAI Tool Call 格式
 */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI 标准消息格式
 */
export interface OpenAIMessage {
  role: MessageRole;
  content: string | OpenAIContentPart[] | null;
  /** 可选的名称（用于区分同角色的不同用户） */
  name?: string;
  /** Tool Calls（assistant 消息中的函数调用） */
  tool_calls?: OpenAIToolCall[];
  /** Tool Call ID（tool 角色消息必需） */
  tool_call_id?: string;
}

/**
 * OpenAI 多模态内容部分
 */
export type OpenAIContentPart = OpenAITextContent | OpenAIImageContent;

/**
 * OpenAI 文本内容
 */
export interface OpenAITextContent {
  type: 'text';
  text: string;
}

/**
 * OpenAI 图片内容
 */
export interface OpenAIImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * 基础消息约束接口
 * 用于 Provider 泛型约束
 */
export interface BaseMessage {
  content: string | unknown;
}

/**
 * 消息状态转换配置
 */
export const MESSAGE_STATUS_TRANSITIONS: Record<
  MessageStatus,
  MessageStatus[]
> = {
  local: ['loading', 'error', 'cancelled'],
  loading: ['streaming', 'success', 'error', 'cancelled'],
  streaming: ['success', 'error', 'cancelled'],
  success: [], // 终态
  error: ['loading'], // 可重试
  cancelled: ['loading'], // 可重试
};
