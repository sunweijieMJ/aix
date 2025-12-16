/**
 * @fileoverview ToolCall 类型定义
 * 用于表示 LLM 的函数调用
 */

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

/**
 * Tool Call 参数类型
 * 使用 unknown 是因为 Tool Call 参数可能是任意 JSON 结构，
 * 且需要与各种 LLM API 兼容（OpenAI, Claude 等）
 */
export type ToolCallArgs = Record<string, unknown>;

/**
 * Tool Call 数据结构
 */
export interface ToolCall {
  /** Tool 唯一ID */
  id: string;
  /** Tool 名称 */
  name: string;
  /** 状态 */
  status: ToolCallStatus;
  /** 调用参数（JSON 格式，使用 any 以兼容各种 LLM API） */
  args: ToolCallArgs;
  /** 返回结果 */
  result?: unknown;
  /** 错误信息 */
  error?: Error | string;
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 自定义元数据 */
  metadata?: Record<string, unknown>;
}
