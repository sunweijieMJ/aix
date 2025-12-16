/**
 * @fileoverview Think 组件类型定义
 * 用于展示 AI 的思考过程
 */

import type { VNode, Component } from 'vue';

/**
 * 思考状态
 */
export type ThinkStatus = 'thinking' | 'done' | 'error';

/**
 * Think 组件 Props
 */
export interface ThinkProps {
  /** 思考内容 */
  content?: string;
  /** 思考状态 */
  status?: ThinkStatus;
  /** 标题（当设置后会覆盖状态标题，不推荐使用） */
  title?: string;
  /** 思考中标题 */
  thinkingTitle?: string;
  /** 思考完成标题 */
  doneTitle?: string;
  /** 思考出错标题 */
  errorTitle?: string;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认是否展开 */
  defaultExpanded?: boolean;
  /** 完成后是否自动收起 */
  autoCollapseOnDone?: boolean;
  /** 是否显示时间 */
  showTime?: boolean;
  /** 开始时间戳 */
  startTime?: number;
  /** 结束时间戳 */
  endTime?: number;
  /** 自定义图标 */
  icon?: VNode | Component | string;
  /** 思考中的图标 */
  thinkingIcon?: VNode | Component | string;
  /** 完成图标 */
  doneIcon?: VNode | Component | string;
  /** 错误图标 */
  errorIcon?: VNode | Component | string;
  /** 打字动画 */
  typing?: boolean;
  /** 打字速度 (ms) */
  typingSpeed?: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    header?: string;
    icon?: string;
    title?: string;
    time?: string;
    content?: string;
    toggle?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    header?: Record<string, string>;
    icon?: Record<string, string>;
    title?: Record<string, string>;
    time?: Record<string, string>;
    content?: Record<string, string>;
    toggle?: Record<string, string>;
  };
}

/**
 * Think 组件 Emits
 */
export interface ThinkEmits {
  /** 展开/折叠 */
  (e: 'toggle', expanded: boolean): void;
  /** 打字完成 */
  (e: 'typingComplete'): void;
}
