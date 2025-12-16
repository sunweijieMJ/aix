/**
 * @fileoverview Suggestion 组件类型定义
 */

import type { VNode, Component } from 'vue';

/** 建议项 */
export interface SuggestionItem {
  /** 唯一标识 */
  key: string;
  /** 建议内容 */
  label: string;
  /** 图标 */
  icon?: string | VNode | Component;
  /** 描述 */
  description?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 额外数据 */
  extra?: Record<string, unknown>;
}

/**
 * 建议项渲染函数参数
 */
export interface SuggestionRenderProps {
  /** 建议项数据 */
  item: SuggestionItem;
  /** 索引 */
  index: number;
  /** 点击处理函数 */
  onClick: () => void;
}

/**
 * 建议项渲染函数
 */
export type SuggestionItemRender = (props: SuggestionRenderProps) => VNode;

/** Suggestion 组件 Props */
export interface SuggestionProps {
  /** 建议列表 */
  items?: SuggestionItem[];
  /** 标题 */
  title?: string;
  /** 布局方式 */
  layout?: 'horizontal' | 'vertical';
  /** 是否换行（仅水平布局有效） */
  wrap?: boolean;
  /** 列数（仅垂直布局 + wrap 有效） */
  columns?: number;
  /** 是否显示箭头 */
  showArrow?: boolean;
  /** 自定义项渲染函数（render props 模式） */
  itemRender?: SuggestionItemRender;
  /** 是否禁用所有项 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    title?: string;
    list?: string;
    item?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    title?: Record<string, string>;
    list?: Record<string, string>;
    item?: Record<string, string>;
  };
}

/** Suggestion 组件 Emits */
export interface SuggestionEmits {
  (e: 'select', item: SuggestionItem): void;
}
