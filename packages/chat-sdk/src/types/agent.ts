/**
 * @fileoverview Agent 相关类型定义
 * 框架无关的核心类型
 */

import type { ChatMessage } from './message';
import type { ToolCall } from './tool-call';

/**
 * Agent 上下文数据类型
 */
export type AgentContext = Record<string, unknown>;

/**
 * Agent 请求信息
 */
export interface AgentRequestInfo<C extends AgentContext = AgentContext> {
  /** 当前用户消息 */
  message: string;
  /** 完整消息历史 */
  messages: ChatMessage[];
  /** 额外上下文（可自定义类型） */
  context?: C;
}

/**
 * Agent 响应回调（支持流式响应）
 */
export interface AgentCallbacks {
  /** 流式更新回调 */
  onUpdate?: (chunk: string) => void;
  /** 成功回调 */
  onSuccess?: (content: string) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** Tool Call 开始回调 */
  onToolCallStart?: (toolCall: ToolCall) => void;
  /** Tool Call 更新回调 */
  onToolCallUpdate?: (id: string, updates: Partial<ToolCall>) => void;
  /** Tool Call 完成回调 */
  onToolCallEnd?: (id: string, result: unknown) => void;
  /** Tool Call 错误回调 */
  onToolCallError?: (id: string, error: Error) => void;
}

/**
 * Agent 请求函数签名
 */
export type AgentRequest = (
  info: AgentRequestInfo,
  callbacks: AgentCallbacks,
) => Promise<void> | void;

/**
 * Agent 配置选项（框架无关）
 */
export interface AgentConfig {
  /** 请求函数 */
  request: AgentRequest;
  /** 默认模型参数 */
  model?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * Agent 运行状态
 */
export interface AgentState {
  /** 是否正在加载 */
  loading: boolean;
  /** 模型名称 */
  model: string;
  /** Tool Calls 列表 */
  toolCalls: ToolCall[];
}
