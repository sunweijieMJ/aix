/**
 * @fileoverview 通用 Action 类型定义
 * Actions 和 AgentActions 组件的基础类型
 */

import type { Component } from 'vue';

/**
 * 基础操作项接口
 * 包含所有 Action 类型的通用字段
 */
export interface BaseActionItem {
  /** 唯一标识 */
  key: string;
  /** 图标（emoji 字符串或 Vue 组件） */
  icon?: string | Component;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义数据 */
  meta?: Record<string, any>;
}
