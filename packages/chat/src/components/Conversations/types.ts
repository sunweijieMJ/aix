/**
 * @fileoverview Conversations 组件类型定义
 */

import type { VNode, Component } from 'vue';

/**
 * 会话元数据类型
 */
export type ConversationMeta = Record<string, unknown>;

/**
 * 会话项
 */
export interface ConversationItem<
  M extends ConversationMeta = ConversationMeta,
> {
  /** 会话 ID */
  id: string;
  /** 会话标题 */
  title: string;
  /** 最后消息时间 */
  lastMessageTime?: number;
  /** 最后消息预览 */
  lastMessage?: string;
  /** 消息数量 */
  messageCount?: number;
  /** 是否置顶 */
  pinned?: boolean;
  /** 分组键（用于自定义分组） */
  group?: string;
  /** 自定义数据（可自定义类型） */
  meta?: M;
}

/**
 * 分组配置
 */
export interface ConversationGroup {
  /** 分组键 */
  key: string;
  /** 分组标题 */
  title: string;
  /** 分组排序权重（越小越靠前） */
  order?: number;
}

/**
 * 分组函数参数
 */
export interface GroupableParams {
  /** 会话项 */
  item: ConversationItem;
  /** 当前时间戳 */
  now: number;
}

/**
 * 分组函数
 */
export type GroupableFunction = (params: GroupableParams) => ConversationGroup;

/**
 * 分组渲染函数参数
 */
export interface GroupTitleRenderProps {
  /** 分组信息 */
  group: ConversationGroup;
  /** 分组内的会话数量 */
  count: number;
}

/**
 * 分组渲染函数
 */
export type GroupTitleRender = (props: GroupTitleRenderProps) => VNode;

/**
 * 会话项渲染函数参数
 */
export interface ConversationItemRenderProps {
  /** 会话项数据 */
  item: ConversationItem;
  /** 是否激活 */
  active: boolean;
  /** 点击处理函数 */
  onClick: () => void;
  /** 删除处理函数 */
  onDelete: () => void;
}

/**
 * 会话项渲染函数
 */
export type ConversationItemRender = (
  props: ConversationItemRenderProps,
) => VNode;

/**
 * 快捷键配置
 * @description 支持数字键快速切换会话
 */
export interface ShortcutKeysConfig {
  /** 新建会话的快捷键 (1-9)，如设置为 1，则按 1 创建新会话 */
  creation?: number;
  /** 切换会话的快捷键数组，如 [2, 3, 4, 5] 表示按 2-5 切换前 4 个会话 */
  items?: number[];
  /** 是否启用快捷键（默认 true） */
  enabled?: boolean;
}

/**
 * Conversations 组件 Props
 */
export interface ConversationsProps {
  /** 会话列表 */
  items: ConversationItem[];
  /** 当前激活的会话 ID */
  activeId?: string;
  /** 是否显示新建按钮 */
  showNew?: boolean;
  /** 新建按钮文字 */
  newText?: string;
  /** 标题 */
  title?: string;
  /** 是否启用分组（true 使用默认按时间分组，或传入自定义分组函数） */
  groupable?: boolean | GroupableFunction;
  /** 自定义分组标题渲染 */
  groupTitleRender?: GroupTitleRender;
  /** 自定义会话项渲染 */
  itemRender?: ConversationItemRender;
  /** 是否显示会话图标 */
  showIcon?: boolean;
  /** 自定义会话图标 */
  icon?: string | VNode | Component;
  /** 滚动加载配置 */
  scrollLoad?: ScrollLoadConfig;
  /** 右键菜单配置 */
  menu?: ConversationMenuConfig;
  /** 是否显示搜索框 */
  showSearch?: boolean;
  /** 搜索占位符 */
  searchPlaceholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /**
   * 快捷键配置
   * @example { creation: 1, items: [2, 3, 4, 5] } - 按 1 新建，按 2-5 切换会话
   */
  shortcutKeys?: ShortcutKeysConfig;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    header?: string;
    search?: string;
    list?: string;
    group?: string;
    groupTitle?: string;
    item?: string;
    menu?: string;
    loader?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    header?: Record<string, string>;
    search?: Record<string, string>;
    list?: Record<string, string>;
    group?: Record<string, string>;
    groupTitle?: Record<string, string>;
    item?: Record<string, string>;
    menu?: Record<string, string>;
    loader?: Record<string, string>;
  };
}

/**
 * Conversations 组件 Emits
 */
export interface ConversationsEmits {
  (e: 'select', item: ConversationItem): void;
  (e: 'delete', id: string): void;
  (e: 'rename', id: string, title: string): void;
  (e: 'new'): void;
  /** 滚动加载更多 */
  (e: 'loadMore'): void;
  /** 菜单操作 */
  (e: 'menuAction', action: string, item: ConversationItem): void;
  /** 置顶/取消置顶 */
  (e: 'pin', id: string, pinned: boolean): void;
}

/**
 * 内置分组类型
 */
export type BuiltInGroupType =
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last30days'
  | 'older';

/**
 * 内置分组配置
 */
export const BUILT_IN_GROUPS: Record<BuiltInGroupType, ConversationGroup> = {
  today: { key: 'today', title: '今天', order: 0 },
  yesterday: { key: 'yesterday', title: '昨天', order: 1 },
  last7days: { key: 'last7days', title: '最近 7 天', order: 2 },
  last30days: { key: 'last30days', title: '最近 30 天', order: 3 },
  older: { key: 'older', title: '更早', order: 4 },
};

/**
 * 菜单项
 */
export interface ConversationMenuItem {
  /** 唯一标识 */
  key: string;
  /** 显示文本 */
  label: string;
  /** 图标 */
  icon?: VNode | Component | string;
  /** 是否危险操作 */
  danger?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 分割线 */
  divider?: boolean;
}

/**
 * 滚动加载配置
 */
export interface ScrollLoadConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 触发加载的阈值（距离底部的像素） */
  threshold?: number;
  /** 是否正在加载 */
  loading?: boolean;
  /** 是否还有更多数据 */
  hasMore?: boolean;
  /** 加载中文字 */
  loadingText?: string;
  /** 没有更多数据文字 */
  noMoreText?: string;
}

/**
 * 菜单配置
 */
export interface ConversationMenuConfig {
  /** 是否启用右键菜单 */
  enabled?: boolean;
  /** 菜单项 */
  items?: ConversationMenuItem[];
  /** 是否显示内置菜单项（重命名、删除、置顶） */
  showBuiltIn?: boolean;
}
