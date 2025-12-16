/**
 * @fileoverview Agent Vue 特有类型定义
 * 核心类型从 @aix/chat-sdk 重新导出
 */

import type {
  AgentRequest,
  AgentRequestInfo,
  AgentCallbacks,
  ToolCall,
} from '@aix/chat-sdk';
import type { Ref } from 'vue';

/**
 * useXAgent 配置选项（Vue 特有）
 */
export interface UseXAgentOptions {
  /** 请求函数 */
  request: AgentRequest;
  /** 默认模型参数 */
  model?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * useXAgent 返回值（Vue 特有）
 */
export interface UseXAgentReturn {
  /** 执行 AI 请求 */
  run: (info: AgentRequestInfo, callbacks: AgentCallbacks) => Promise<void>;
  /** 停止当前请求 */
  stop: () => void;
  /** 加载状态 */
  loading: Ref<boolean>;
  /** 模型名称 */
  model: string;
  /** Tool Calls 列表 */
  toolCalls: Ref<ToolCall[]>;
  /** 添加 Tool Call */
  addToolCall: (toolCall: ToolCall) => void;
  /** 更新 Tool Call */
  updateToolCall: (id: string, updates: Partial<ToolCall>) => void;
  /** 清空 Tool Calls */
  clearToolCalls: () => void;
}
