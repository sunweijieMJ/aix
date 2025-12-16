/**
 * @fileoverview ToolCall 组件类型定义
 * 用于可视化 LLM 的函数调用过程
 *
 * 注意: ToolCall, ToolCallStatus 请直接从 @aix/chat-sdk 导入
 */

import type { ToolCall, ToolCallStatus } from '@aix/chat-sdk';

/**
 * ToolCallUI 组件 Props
 */
export interface ToolCallUIProps {
  /** Tool Call 数据 */
  toolCall: ToolCall;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认是否折叠 */
  defaultCollapsed?: boolean;
  /** 是否显示执行时间 */
  showExecutionTime?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * ToolCallUI 组件插槽
 */
export interface ToolCallUISlots {
  /** 自定义参数渲染 */
  args?: (props: { args: Record<string, unknown> }) => unknown;
  /** 自定义结果渲染 */
  result?: (props: { result: unknown; error?: Error | string }) => unknown;
  /** 自定义加载状态 */
  loading?: () => unknown;
  /** 自定义工具图标 */
  icon?: (props: { name: string; status: ToolCallStatus }) => unknown;
}

/**
 * ToolCallList 组件 Props
 */
export interface ToolCallListProps {
  /** Tool Calls 列表 */
  toolCalls: ToolCall[];
  /** 是否显示时间线 */
  showTimeline?: boolean;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认是否全部折叠 */
  defaultCollapsed?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * ToolCallList 组件 Emits
 */
export interface ToolCallListEmits {
  /** Tool Call 点击事件 */
  (e: 'click', toolCall: ToolCall): void;
}
