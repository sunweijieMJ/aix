/**
 * @fileoverview Prompts 组件类型定义
 */

import type { VNode, Component } from 'vue';

/**
 * 提示词项
 */
export interface PromptItem {
  /** 唯一标识 */
  key: string;
  /** 显示标签 */
  label: string;
  /** 描述文字 */
  description?: string;
  /** 图标 */
  icon?: string | VNode | Component;
  /** 提示词内容 */
  prompt?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 子项（支持嵌套） */
  children?: PromptItem[];
}

/**
 * Prompts 变体样式
 */
export type PromptsVariant = 'filled' | 'outlined' | 'borderless';

/**
 * 提示词项渲染参数
 */
export interface PromptItemRenderProps {
  /** 提示词项数据 */
  item: PromptItem;
  /** 点击处理函数 */
  onClick: () => void;
  /** 是否激活 */
  active?: boolean;
}

/**
 * 提示词项渲染函数
 */
export type PromptItemRender = (props: PromptItemRenderProps) => VNode;

/**
 * Prompts 组件 Props
 */
export interface PromptsProps {
  /** 标题 */
  title?: string;
  /** 提示词列表 */
  items: PromptItem[];
  /** 布局方式 */
  layout?: 'grid' | 'list' | 'inline';
  /** 网格列数 */
  columns?: number;
  /** 变体样式 */
  variant?: PromptsVariant;
  /** 是否换行（inline 布局时） */
  wrap?: boolean;
  /** 是否垂直排列 */
  vertical?: boolean;
  /** 是否显示箭头图标 */
  showArrow?: boolean;
  /** 自定义项渲染 */
  itemRender?: PromptItemRender;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    title?: string;
    list?: string;
    item?: string;
    icon?: string;
    label?: string;
    description?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    title?: Record<string, string>;
    list?: Record<string, string>;
    item?: Record<string, string>;
    icon?: Record<string, string>;
    label?: Record<string, string>;
    description?: Record<string, string>;
  };
}

/**
 * Prompts 组件 Emits
 */
export interface PromptsEmits {
  (e: 'select', item: PromptItem): void;
}
