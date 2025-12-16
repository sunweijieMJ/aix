/**
 * @fileoverview ThoughtChain 组件类型定义
 */

import type { VNode, Component } from 'vue';

/** 思维链步骤类型 */
export type ThoughtStepType =
  | 'thought'
  | 'action'
  | 'observation'
  | 'success'
  | 'error'
  | 'pending';

/** 思维链步骤状态 */
export type ThoughtStepStatus = 'pending' | 'running' | 'success' | 'error';

/** 连接线样式 */
export type ThoughtChainLineType = 'solid' | 'dashed' | 'dotted' | 'none';

/** 思维链步骤 */
export interface ThoughtStep {
  /** 唯一标识 */
  key?: string | number;
  /** 步骤类型 */
  type: ThoughtStepType;
  /** 步骤标题 */
  title?: string;
  /** 步骤内容 */
  content: string;
  /** 步骤状态 */
  status?: ThoughtStepStatus;
  /** 工具名称（仅 action 类型） */
  tool?: string;
  /** 工具参数（仅 action 类型） */
  params?: Record<string, unknown>;
  /** 时间戳 */
  timestamp?: number;
  /** 持续时间（毫秒） */
  duration?: number;
  /** 自定义图标 */
  icon?: VNode | Component | string;
  /** 额外数据 */
  extra?: Record<string, unknown>;
}

/** ThoughtChain 组件 Props */
export interface ThoughtChainProps {
  /** 步骤列表 */
  steps?: ThoughtStep[];
  /** 是否加载中 */
  loading?: boolean;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认是否展开 */
  defaultExpanded?: boolean;
  /** 连接线样式 */
  lineType?: ThoughtChainLineType;
  /** 连接线颜色 */
  lineColor?: string;
  /** 是否显示闪烁光标（加载时） */
  showBlink?: boolean;
  /** 闪烁光标颜色 */
  blinkColor?: string;
  /** 是否显示时间戳 */
  showTimestamp?: boolean;
  /** 是否显示持续时间 */
  showDuration?: boolean;
  /** 自定义步骤渲染 */
  stepRender?: (step: ThoughtStep, index: number) => VNode;
  /** 自定义图标渲染 */
  iconRender?: (step: ThoughtStep) => VNode;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    item?: string;
    line?: string;
    icon?: string;
    content?: string;
    blink?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    item?: Record<string, string>;
    line?: Record<string, string>;
    icon?: Record<string, string>;
    content?: Record<string, string>;
    blink?: Record<string, string>;
  };
}

/** ThoughtChain 组件 Emits */
export interface ThoughtChainEmits {
  (e: 'stepClick', step: ThoughtStep, index: number): void;
  (e: 'expand'): void;
  (e: 'collapse'): void;
}
