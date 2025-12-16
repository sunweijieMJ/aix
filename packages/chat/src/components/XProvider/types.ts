/**
 * @fileoverview XProvider 全局配置类型定义
 */

import type { CSSProperties } from 'vue';
import type { ShortcutKeysConfig } from '../Conversations/types';

/**
 * 组件级别的样式配置
 * @description 用于全局配置某个组件的默认样式
 */
export interface XComponentStyleConfig {
  /** 自定义类名 */
  className?: string;
  /** 语义化类名映射 */
  classNames?: Record<string, string>;
  /** 语义化样式映射 */
  styles?: Record<string, CSSProperties>;
}

/**
 * Bubble 组件全局配置
 */
export interface XBubbleConfig extends XComponentStyleConfig {
  /** 默认变体 */
  variant?: 'outlined' | 'filled' | 'borderless' | 'shadow';
  /** 默认形状 */
  shape?: 'default' | 'round' | 'corner';
  /** 是否启用 Markdown */
  enableMarkdown?: boolean;
}

/**
 * Sender 组件全局配置
 */
export interface XSenderConfig extends XComponentStyleConfig {
  /** 提交方式 */
  submitType?: 'enter' | 'shiftEnter' | 'ctrlEnter' | false;
  /** 是否启用语音 */
  allowSpeech?: boolean;
  /** 是否自动调整高度 */
  autoSize?: boolean;
}

/**
 * Conversations 组件全局配置
 */
export interface XConversationsConfig extends XComponentStyleConfig {
  /** 快捷键配置 */
  shortcutKeys?: ShortcutKeysConfig;
  /** 是否显示新建按钮 */
  showNew?: boolean;
  /** 是否启用分组 */
  groupable?: boolean;
}

/**
 * 组件配置映射
 */
export interface XComponentsConfig {
  /** Bubble 组件配置 */
  bubble?: XBubbleConfig;
  /** Sender 组件配置 */
  sender?: XSenderConfig;
  /** Conversations 组件配置 */
  conversations?: XConversationsConfig;
}

/** XProvider 配置 */
export interface XProviderConfig {
  /** OpenAI API Key */
  apiKey?: string;
  /** API 基础 URL */
  baseURL?: string;
  /** 模型名称 */
  model?: string;
  /** 主题 */
  theme?: 'light' | 'dark' | 'auto';
  /** 语言 */
  locale?: 'zh-CN' | 'en-US';
  /** 默认参数 */
  defaultParams?: Record<string, any>;
  /**
   * 组件级别配置
   * @description 全局配置各组件的默认样式和行为
   * @example { bubble: { variant: 'filled' }, sender: { submitType: 'ctrlEnter' } }
   */
  components?: XComponentsConfig;
}

/** XProvider 组件 Props */
export interface XProviderProps {
  /** 配置对象 */
  config?: XProviderConfig;
}

/** XProvider Injection Key */
export const X_PROVIDER_KEY = Symbol('x-provider');
