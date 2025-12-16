/**
 * @fileoverview Actions 组件类型定义
 */

import type { VNode } from 'vue';
import type { BaseActionItem } from '../../types/action';

export type ActionVariant = 'text' | 'outlined' | 'filled';

/**
 * Action 状态
 */
export type ActionStatus = 'default' | 'loading' | 'running' | 'error';

/**
 * 反馈值类型
 */
export type FeedbackValue = 'like' | 'dislike' | 'default';

/**
 * Actions 组件的操作项
 * 继承基础 ActionItem，扩展了 label（可选）、danger 和 children 字段
 */
export interface ActionItem extends BaseActionItem {
  /** 显示文本（可选） */
  label?: string;
  /** 是否危险操作 */
  danger?: boolean;
  /** 子菜单项 */
  children?: ActionItem[];
}

export interface ActionsProps {
  /** 操作项列表 */
  items?: ActionItem[];
  /** 样式变体 */
  variant?: ActionVariant;
  /** 是否禁用所有操作 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

export interface ActionsEmits {
  /** 操作点击事件 */
  (e: 'action', key: string, item: ActionItem): void;
}

export interface ActionsSlots {
  /** 自定义操作项渲染 */
  item?: (props: { item: ActionItem; index: number }) => any;
  /** 自定义子菜单渲染 */
  children?: (props: { items: ActionItem[] }) => any;
}

// ==================== 子组件类型 ====================

/**
 * Actions.Copy 组件 Props
 */
export interface ActionCopyProps {
  /** 要复制的文本 */
  text: string;
  /** 自定义图标 */
  icon?: VNode | string;
  /** 复制成功后的图标 */
  copiedIcon?: VNode | string;
  /** 复制成功提示文字 */
  copiedText?: string;
  /** 提示显示时长 (ms) */
  copiedDuration?: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * Actions.Copy 组件 Emits
 */
export interface ActionCopyEmits {
  /** 复制成功 */
  (e: 'copy', text: string): void;
  /** 复制失败 */
  (e: 'error', error: Error): void;
}

/**
 * Actions.Feedback 组件 Props
 */
export interface ActionFeedbackProps {
  /** 当前值 */
  value?: FeedbackValue;
  /** 默认值 */
  defaultValue?: FeedbackValue;
  /** 点赞图标 */
  likeIcon?: VNode | string;
  /** 点赞激活图标 */
  likeActiveIcon?: VNode | string;
  /** 踩图标 */
  dislikeIcon?: VNode | string;
  /** 踩激活图标 */
  dislikeActiveIcon?: VNode | string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * Actions.Feedback 组件 Emits
 */
export interface ActionFeedbackEmits {
  /** 值变化 */
  (e: 'change', value: FeedbackValue): void;
  /** 更新 v-model */
  (e: 'update:value', value: FeedbackValue): void;
}

/**
 * Actions.Audio 组件 Props
 */
export interface ActionAudioProps {
  /** 播放状态 */
  status?: ActionStatus;
  /** 音频内容（用于 TTS） */
  content?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * Actions.Audio 组件 Emits
 */
export interface ActionAudioEmits {
  /** 点击事件 */
  (e: 'click'): void;
}
