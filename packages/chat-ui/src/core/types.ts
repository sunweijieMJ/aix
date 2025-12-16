/**
 * @fileoverview @aix/chat-ui 核心类型定义
 * 定义内容块、渲染器、插件等核心类型
 */

import type { Component, CSSProperties } from 'vue';

// =============================================================================
// 内容类型
// =============================================================================

/**
 * 内置内容类型
 */
export type BuiltInContentType =
  | 'text' // 纯文本
  | 'markdown' // Markdown
  | 'html' // HTML
  | 'latex' // LaTeX 公式
  | 'code' // 代码块
  | 'chart' // 图表
  | 'mermaid' // 流程图
  | 'mindmap' // 思维导图
  | 'table' // 表格
  | 'image' // 图片
  | 'audio' // 音频
  | 'video' // 视频
  | 'file'; // 文件

/**
 * 内容类型（内置 + 自定义扩展）
 * @description 使用模板字面量类型支持自定义扩展，同时保持类型提示
 */
export type ContentType = BuiltInContentType | `custom:${string}`;

// =============================================================================
// 内容块
// =============================================================================

/**
 * 内容块状态
 */
export type ContentBlockStatus = 'pending' | 'rendering' | 'complete' | 'error';

/**
 * 内容块 - AI 输出的基本单元
 */
export interface ContentBlock<T = unknown> {
  /** 唯一标识 */
  id: string;
  /** 内容类型 */
  type: ContentType;
  /** 原始内容 */
  raw: string;
  /** 解析后的数据（根据类型不同） */
  data?: T;
  /** 渲染状态 */
  status?: ContentBlockStatus;
  /** 错误信息 */
  error?: string;
  /** 元数据 */
  meta?: Record<string, unknown>;
  /** 自定义样式类 */
  className?: string;
  /** 自定义样式 */
  style?: CSSProperties;
}

// =============================================================================
// 渲染器
// =============================================================================

/**
 * 渲染器组件 Props
 */
export interface RendererProps<T = unknown> {
  /** 内容块 */
  block: ContentBlock<T>;
  /** 解析后的数据 */
  data: T;
  /** 流式状态（布尔值兼容） */
  streaming?: boolean;
  /** 流式状态（详细） */
  streamStatus?: 'loading' | 'done';
  /** 自定义样式类 */
  className?: string;
  /** 自定义样式 */
  style?: CSSProperties;
}

/**
 * 渲染器组件 Emits
 */
export interface RendererEmits {
  /** 操作事件 */
  (e: 'action', payload: RendererActionEvent): void;
  /** 渲染完成事件 */
  (e: 'rendered'): void;
  /** 错误事件 */
  (e: 'error', error: Error): void;
}

/**
 * 渲染器操作事件
 */
export interface RendererActionEvent {
  /** 操作类型 */
  action: string;
  /** 操作数据 */
  data?: unknown;
  /** 内容块 ID */
  blockId?: string;
}

/**
 * 渲染器定义
 */
export interface RendererDefinition<T = unknown> {
  /** 渲染器名称（唯一标识） */
  name: string;
  /** 处理的内容类型（可以是单个或多个） */
  type: ContentType | ContentType[];
  /** 渲染器组件（同步加载） */
  component?: Component;
  /** 异步加载器（按需加载） */
  loader?: () => Promise<Component | { default: Component }>;
  /** 内容解析函数（将 raw 转为 data） */
  parser?: (raw: string, meta?: Record<string, unknown>) => T;
  /** 内容检测函数（判断是否匹配此渲染器） */
  detector?: (raw: string) => boolean;
  /** 优先级（数字越大优先级越高，默认 0） */
  priority?: number;
  /** 是否支持流式渲染 */
  streaming?: boolean;
  /** 渲染器描述 */
  description?: string;
}

// =============================================================================
// 流式渲染
// =============================================================================

/**
 * 流式渲染状态
 */
export type StreamStatus = 'idle' | 'streaming' | 'complete' | 'error';

/**
 * 流式渲染配置
 */
export interface StreamingConfig {
  /** 是否还有后续内容 */
  hasNextChunk?: boolean;
  /** 启用打字动画 */
  enableAnimation?: boolean;
  /** 动画配置 */
  animationConfig?: TypingAnimationConfig;
}

/**
 * 打字动画配置
 */
export interface TypingAnimationConfig {
  /** 淡入动画持续时间（毫秒） */
  fadeDuration?: number;
  /** 动画缓动函数 */
  easing?: string;
  /** 每帧渲染的字符数（可以是固定值或范围） */
  step?: number | [number, number];
  /** 帧间隔（毫秒） */
  interval?: number;
  /** 动画效果类型 */
  effect?: 'typing' | 'fade-in';
  /** 是否保留已渲染部分（流式时只渲染增量） */
  keepPrefix?: boolean;
}

// =============================================================================
// ContentRenderer Props
// =============================================================================

/**
 * ContentRenderer 组件 Props
 * 注意：主题由 @aix/theme 统一控制，不再需要 theme prop
 */
export interface ContentRendererProps {
  /** 原始内容 */
  content: string;
  /** 强制指定类型（不自动检测） */
  type?: ContentType;
  /** 流式渲染配置 */
  streaming?: boolean | StreamingConfig;
  /** 自定义样式类 */
  className?: string;
  /** 自定义样式 */
  style?: CSSProperties;
  /** 自定义解析器 */
  parser?: (content: string) => ContentBlock | ContentBlock[];
}

/**
 * ContentRenderer 组件 Emits
 */
export interface ContentRendererEmits {
  /** 操作事件 */
  (
    e: 'action',
    payload: { blockId: string; action: string; data?: unknown },
  ): void;
  /** 渲染完成事件 */
  (e: 'rendered', blocks: ContentBlock[]): void;
  /** 错误事件 */
  (e: 'error', error: Error): void;
}
