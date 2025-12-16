/**
 * @fileoverview AgentActions 组件类型定义
 */

import type { BaseActionItem } from '../../types/action';

/**
 * AgentActions 组件的操作项
 * 继承基础 ActionItem，扩展了 label（必需）、badge 和 active 字段
 */
export interface AgentAction extends BaseActionItem {
  /** 显示文本（必需） */
  label: string;
  /** 徽标文本 */
  badge?: string;
  /** 是否激活状态 */
  active?: boolean;
}

/** AgentActions 组件 Props */
export interface AgentActionsProps {
  title?: string;
  actions: AgentAction[];
  showDivider?: boolean;
  className?: string;
}

/** AgentActions 组件 Emits */
export interface AgentActionsEmits {
  (e: 'click', action: AgentAction): void;
}
