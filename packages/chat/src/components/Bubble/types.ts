/**
 * @fileoverview Bubble 组件类型定义
 */

import type {
  MessageRole,
  ChatMessage,
  MessageContent,
  ToolCall,
} from '@aix/chat-sdk';
import type { CSSProperties, VNode } from 'vue';

/**
 * Bubble 内容类型 - 简化为只支持 MessageContent
 * 这样可以避免类型不匹配问题
 */

export type BubbleContentType = MessageContent;

/**
 * 打字动画配置
 */
export interface BubbleTypingOption {
  /** 动画效果类型 */
  effect?: 'typing' | 'fade-in';
  /** 每次显示字符数，可设置范围 [min, max] */
  step?: number | [number, number];
  /** 更新间隔 (ms) */
  interval?: number;
  /** 保持前缀（流式时不重置已显示内容） */
  keepPrefix?: boolean;
}

/**
 * 气泡形状
 */
export type BubbleShape = 'default' | 'round' | 'corner';

/**
 * 语义化部分类型
 */
export type BubbleSemanticType =
  | 'root'
  | 'avatar'
  | 'wrapper'
  | 'header'
  | 'body'
  | 'content'
  | 'toolCalls'
  | 'footer'
  | 'actions';

/**
 * 编辑配置
 */
export interface BubbleEditableConfig {
  /** 是否启用编辑 */
  enabled?: boolean;
  /** 编辑图标 */
  icon?: VNode | string;
  /** 编辑提示文字 */
  tooltip?: string;
  /** 确认按钮文字 */
  confirmText?: string;
  /** 取消按钮文字 */
  cancelText?: string;
  /** 最大字符数 */
  maxLength?: number;
  /** 是否显示字数统计 */
  showCount?: boolean;
  /** 自动聚焦 */
  autoFocus?: boolean;
}

/**
 * Bubble 组件 Props
 */
export interface BubbleProps {
  /** 消息角色 */
  role?: MessageRole;
  /** 消息内容 */
  content?: MessageContent;
  /** 气泡位置 */
  placement?: 'start' | 'end';
  /** 头像（false 隐藏，string 自定义 URL） */
  avatar?: string | boolean;
  /** 内容变体 */
  variant?: 'outlined' | 'filled' | 'borderless' | 'shadow';
  /** 气泡形状 */
  shape?: BubbleShape;
  /** 加载状态 */
  loading?: boolean;
  /** 打字动画配置 */
  typing?: boolean | BubbleTypingOption;
  /** 是否启用 Markdown 渲染 */
  enableMarkdown?: boolean;
  /** Tool Calls（函数调用记录） */
  toolCalls?: ToolCall[];
  /** 是否可编辑（true 使用默认配置，或传入配置对象） */
  editable?: boolean | BubbleEditableConfig;
  /** 自定义类名 */
  className?: string;
  /** 语义化样式配置 */
  styles?: Partial<Record<BubbleSemanticType, CSSProperties>>;
  /** 语义化类名配置 */
  classNames?: Partial<Record<BubbleSemanticType, string>>;
  /** 自定义内容渲染函数 */
  messageRender?: (content: string) => VNode | string;
}

/**
 * Bubble 组件 Emits
 */
export interface BubbleEmits {
  /** 打字动画完成 */
  (e: 'typingComplete'): void;
  /** 开始编辑 */
  (e: 'editStart'): void;
  /** 编辑完成（确认） */
  (e: 'editEnd', newContent: string): void;
  /** 取消编辑 */
  (e: 'editCancel'): void;
  /** 内容变化（编辑时实时触发） */
  (e: 'update:content', content: string): void;
}

/**
 * 角色配置函数类型
 * @description 支持根据消息数据动态返回配置
 */
export type RoleConfigFunction = (item: ChatMessage) => Partial<BubbleProps>;

/**
 * 角色配置类型（支持静态配置或动态函数）
 */
export type RoleConfig = Partial<BubbleProps> | RoleConfigFunction;

/**
 * 角色配置映射类型
 * @description 支持预定义角色和自定义角色
 */
export type RolesConfig = {
  /** 用户角色配置 */
  user?: RoleConfig;
  /** 助手角色配置 */
  assistant?: RoleConfig;
  /** 系统角色配置 */
  system?: RoleConfig;
  /** 自定义角色配置 */
  [customRole: string]: RoleConfig | undefined;
};

/**
 * 消息动画类型
 */
export type BubbleAnimationType =
  | 'none'
  | 'fade'
  | 'slide'
  | 'scale'
  | 'slide-up'
  | 'slide-down'
  | 'zoom';

/**
 * 动画配置
 */
export interface BubbleAnimationConfig {
  /** 动画类型 */
  type?: BubbleAnimationType;
  /** 动画时长（毫秒） */
  duration?: number;
  /** 动画缓动函数 */
  easing?: string;
  /** 是否级联动画（依次出现） */
  stagger?: boolean;
  /** 级联延迟（毫秒） */
  staggerDelay?: number;
}

/**
 * 消息分组配置
 */
export interface BubbleGroupConfig {
  /** 是否启用分组 */
  enabled?: boolean;
  /**
   * 分组策略
   * - 'time': 按时间间隔分组（超过 interval 的消息会开始新组，基于 createAt 字段）
   * - 'role': 按角色分组（同角色连续消息为一组）
   * - 'custom': 自定义分组函数
   */
  strategy?: 'time' | 'role' | 'custom';
  /** 时间间隔分组的阈值（毫秒，默认 5 分钟） */
  interval?: number;
  /** 自定义分组函数（返回 true 表示开始新组） */
  shouldStartNewGroup?: (
    current: ChatMessage,
    previous: ChatMessage | null,
  ) => boolean;
  /** 分组内是否折叠重复头像 */
  collapseAvatar?: boolean;
  /** 分组是否显示时间分隔线 */
  showTimeDivider?: boolean;
  /** 时间分隔线格式化函数 */
  timeDividerFormat?: (timestamp: number) => string;
}

/**
 * BubbleList 组件 Props
 */
export interface BubbleListProps {
  /** 消息列表 */
  items?: ChatMessage[];
  /**
   * 角色配置
   * @description 支持静态配置或函数式动态配置
   * @example 静态配置: { user: { placement: 'end' }, assistant: { placement: 'start' } }
   * @example 函数配置: { assistant: (item) => ({ variant: item.meta?.urgent ? 'shadow' : 'filled' }) }
   */
  roles?: RolesConfig;
  /** 自动滚动 */
  autoScroll?: boolean;
  /** 是否启用 Markdown 渲染 */
  enableMarkdown?: boolean;
  /**
   * 动画配置
   * @description 控制消息出现的动画效果
   * @example { type: 'slide-up', duration: 300, stagger: true }
   */
  animation?: boolean | BubbleAnimationConfig;
  /**
   * 分组配置
   * @description 将消息按时间或角色分组显示
   * @example { enabled: true, strategy: 'time', interval: 300000, showTimeDivider: true }
   */
  grouping?: boolean | BubbleGroupConfig;
  /** 自定义类名 */
  className?: string;
}

/**
 * BubbleAvatar 组件 Props
 */
export interface BubbleAvatarProps {
  /** 消息角色 */
  role?: MessageRole;
  /** 头像 URL */
  src?: string;
  /** 头像尺寸 */
  size?: 'small' | 'medium' | 'large';
}

/**
 * BubbleContent 组件 Props
 */
export interface BubbleContentProps {
  /** 消息内容 */
  content?: MessageContent;
  /** 内容变体 */
  variant?: 'outlined' | 'filled' | 'borderless' | 'shadow';
  /** 气泡形状 */
  shape?: BubbleShape;
  /** 加载状态 */
  loading?: boolean;
  /** 打字动画配置 */
  typing?: boolean | BubbleTypingOption;
  /** 是否启用 Markdown 渲染 */
  enableMarkdown?: boolean;
  /** 自定义渲染函数 */
  messageRender?: (content: string) => VNode | string;
}

/**
 * BubbleContent 组件 Emits
 */
export interface BubbleContentEmits {
  /** 打字动画完成 */
  (e: 'typingComplete'): void;
}

/**
 * 分隔线类型
 */
export type BubbleDividerType = 'line' | 'text' | 'time' | 'dashed';

/**
 * BubbleDivider 组件 Props
 */
export interface BubbleDividerProps {
  /** 分隔线类型 */
  type?: BubbleDividerType;
  /** 分隔线文字（用于 text/time 类型） */
  text?: string;
  /** 时间戳（用于 time 类型，自动格式化） */
  timestamp?: number;
  /** 时间格式化函数 */
  timeFormat?: (timestamp: number) => string;
  /** 方向 */
  orientation?: 'left' | 'center' | 'right';
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    line?: string;
    text?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    line?: Record<string, string>;
    text?: Record<string, string>;
  };
}

/**
 * 系统消息类型
 */
export type BubbleSystemType =
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'notice';

/**
 * BubbleSystem 组件 Props
 */
export interface BubbleSystemProps {
  /** 系统消息类型 */
  type?: BubbleSystemType;
  /** 消息内容 */
  content?: string;
  /** 自定义图标 */
  icon?: VNode | string;
  /** 是否显示图标 */
  showIcon?: boolean;
  /** 是否可关闭 */
  closable?: boolean;
  /** 时间戳 */
  timestamp?: number;
  /** 是否显示时间 */
  showTime?: boolean;
  /** 时间格式化函数 */
  timeFormat?: (timestamp: number) => string;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    icon?: string;
    content?: string;
    time?: string;
    close?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    icon?: Record<string, string>;
    content?: Record<string, string>;
    time?: Record<string, string>;
    close?: Record<string, string>;
  };
}

/**
 * BubbleSystem 组件 Emits
 */
export interface BubbleSystemEmits {
  /** 关闭事件 */
  (e: 'close'): void;
}

/**
 * 处理后的消息类型（包含分组元数据）
 * 用于 BubbleList 内部处理和插槽暴露
 */
export interface ProcessedMessage extends ChatMessage {
  /** 是否显示时间分隔线 */
  _showTimeDivider?: boolean;
  /** 分隔线时间戳 */
  _dividerTime?: number;
  /** 是否隐藏头像 */
  _hideAvatar?: boolean;
  /** 分组索引 */
  _groupIndex?: number;
}
