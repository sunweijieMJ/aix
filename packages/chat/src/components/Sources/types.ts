/**
 * @fileoverview Sources 组件类型定义
 */

import type { VNode } from 'vue';

/**
 * 引用来源项
 */
export interface SourceItem {
  /** 唯一标识 */
  key: string | number;
  /** 来源标题 */
  title: string;
  /** 来源链接 */
  url?: string;
  /** 来源描述 */
  description?: string;
  /** 来源图标 */
  icon?: VNode | string;
  /** 来源域名（自动从 url 解析，也可手动指定） */
  domain?: string;
  /** 额外数据 */
  extra?: Record<string, unknown>;
}

/**
 * Sources 组件 Props
 */
export interface SourcesProps {
  /** 来源列表 */
  items: SourceItem[];
  /** 标题 */
  title?: string;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认是否折叠 */
  defaultCollapsed?: boolean;
  /** 最大显示数量（超出显示展开按钮） */
  maxCount?: number;
  /** 是否显示序号 */
  showIndex?: boolean;
  /** 链接打开方式 */
  target?: '_blank' | '_self' | '_parent' | '_top';
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    header?: string;
    list?: string;
    item?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    header?: Record<string, string>;
    list?: Record<string, string>;
    item?: Record<string, string>;
  };
}

/**
 * Sources 组件 Emits
 */
export interface SourcesEmits {
  /** 点击来源项 */
  (e: 'click', item: SourceItem): void;
  /** 折叠状态变化 */
  (e: 'collapse', collapsed: boolean): void;
  /** 展开更多 */
  (e: 'expand'): void;
}

/**
 * SourceItem 组件 Props
 */
export interface SourceItemProps {
  /** 来源数据 */
  item: SourceItem;
  /** 序号（从1开始） */
  index?: number;
  /** 是否显示序号 */
  showIndex?: boolean;
  /** 链接打开方式 */
  target?: '_blank' | '_self' | '_parent' | '_top';
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * SourceItem 组件 Emits
 */
export interface SourceItemEmits {
  /** 点击事件 */
  (e: 'click', item: SourceItem): void;
}
