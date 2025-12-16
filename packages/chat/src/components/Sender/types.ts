/**
 * @fileoverview Sender 组件类型定义
 */

import type { VNode, Component } from 'vue';

/* ===== SlotConfig 结构化输入类型 ===== */

/**
 * 基础 Slot 配置
 */
interface SlotConfigBase {
  /** 唯一标识 key（除 text 类型外必填） */
  key?: string;
}

/**
 * 纯文本 Slot
 * @description 显示静态文本
 */
export interface TextSlotConfig extends SlotConfigBase {
  type: 'text';
  /** 文本内容 */
  value: string;
}

/**
 * 输入框 Slot
 * @description 嵌入式输入框
 */
export interface InputSlotConfig extends SlotConfigBase {
  type: 'input';
  key: string;
  props?: {
    /** 默认值 */
    defaultValue?: string;
    /** 占位符 */
    placeholder?: string;
    /** 最大长度 */
    maxLength?: number;
    /** 宽度（默认自适应） */
    width?: string | number;
  };
}

/**
 * 下拉选择 Slot
 * @description 嵌入式下拉选择器
 */
export interface SelectSlotConfig extends SlotConfigBase {
  type: 'select';
  key: string;
  props?: {
    /** 选项列表 */
    options: Array<string | { label: string; value: string }>;
    /** 默认值 */
    defaultValue?: string;
    /** 占位符 */
    placeholder?: string;
    /** 宽度 */
    width?: string | number;
  };
}

/**
 * 标签 Slot
 * @description 可关闭的标签
 */
export interface TagSlotConfig extends SlotConfigBase {
  type: 'tag';
  key: string;
  props?: {
    /** 标签文本 */
    label: string;
    /** 标签值 */
    value?: string;
    /** 是否可关闭 */
    closable?: boolean;
    /** 标签颜色 */
    color?: string;
  };
}

/**
 * 自定义渲染 Slot
 * @description 完全自定义渲染内容
 */
export interface CustomSlotConfig extends SlotConfigBase {
  type: 'custom';
  key: string;
  /** 自定义渲染函数 */
  render: (props: {
    value: any;
    onChange: (value: any) => void;
  }) => VNode | Component;
}

/**
 * SlotConfig 类型联合
 */
export type SlotConfigType =
  | TextSlotConfig
  | InputSlotConfig
  | SelectSlotConfig
  | TagSlotConfig
  | CustomSlotConfig;

/**
 * Slot 值映射类型
 * @description 所有 slot 的当前值
 */
export type SlotValues = Record<string, any>;

/* ===== Skill 技能系统类型 ===== */

/**
 * 技能配置
 * @description 定义一个可切换的 AI 能力/工具
 */
export interface SkillConfig {
  /** 技能唯一标识 */
  key: string;
  /** 技能名称 */
  name: string;
  /** 技能图标（emoji 或图标组件） */
  icon?: string | Component;
  /** 技能描述 */
  description?: string;
  /** 技能专属的 SlotConfig（切换到此技能时使用） */
  slotConfig?: SlotConfigType[];
  /** 技能专属的占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 语音配置
 */
export interface SpeechConfig {
  /** 是否正在录音 */
  recording?: boolean;
  /** 录音状态变化回调 */
  onRecordingChange?: (recording: boolean) => void;
  /** 自定义语音识别函数 */
  customRecognition?: (audio: Blob) => Promise<string>;
}

/**
 * 模型选项
 */
export interface ModelOption {
  /** 模型 ID */
  id: string;
  /** 模型显示名称 */
  label: string;
  /** 模型图标（emoji） */
  icon?: string;
  /** 模型描述 */
  description?: string;
  /** 是否为高级模型 */
  premium?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 提交方式类型
 * - 'enter': 按 Enter 提交，Shift+Enter 换行
 * - 'shiftEnter': 按 Shift+Enter 提交，Enter 换行
 * - 'ctrlEnter': 按 Ctrl/Cmd+Enter 提交，Enter 换行
 * - false: 禁用键盘提交，只能点击按钮
 */
export type SubmitType = 'enter' | 'shiftEnter' | 'ctrlEnter' | false;

/**
 * Sender 语义化部分类型
 */
export type SenderSemanticType =
  | 'root'
  | 'content'
  | 'inputWrapper'
  | 'input'
  | 'voiceButton'
  | 'footer'
  | 'skillSelector'
  | 'modelButton'
  | 'sendButton';

/**
 * Sender 组件 Props
 */
export interface SenderProps {
  /** 输入值（普通模式） */
  value?: string;
  /** 占位符 */
  placeholder?: string;
  /** 禁用状态 */
  disabled?: boolean;
  /** 加载状态 */
  loading?: boolean;
  /** 允许清空 */
  allowClear?: boolean;
  /** 最大长度 */
  maxLength?: number;
  /** 自动聚焦 */
  autoFocus?: boolean;
  /** 自动调整高度 */
  autoSize?: boolean;
  /**
   * 提交方式
   * @default 'enter'
   * @example 'enter' - Enter 提交，Shift+Enter 换行
   * @example 'shiftEnter' - Shift+Enter 提交，Enter 换行
   * @example 'ctrlEnter' - Ctrl/Cmd+Enter 提交，Enter 换行
   * @example false - 禁用键盘提交
   */
  submitType?: SubmitType;
  /**
   * 结构化输入配置（Slot 模式）
   * @description 启用后会切换到结构化输入模式，支持嵌入式输入框、下拉选择等
   * @example [{ type: 'text', value: '搜索' }, { type: 'input', key: 'keyword' }]
   */
  slotConfig?: SlotConfigType[];
  /**
   * 技能列表
   * @description 可切换的 AI 能力/工具列表
   * @example [{ key: 'chat', name: '对话' }, { key: 'search', name: '搜索', slotConfig: [...] }]
   */
  skills?: SkillConfig[];
  /**
   * 当前激活的技能 key
   * @description 与 skills 配合使用，支持 v-model:activeSkill
   */
  activeSkill?: string;
  /** 启用语音输入 */
  allowSpeech?: boolean;
  /** 语音配置 */
  speech?: SpeechConfig;
  /** 模型选项列表 */
  models?: ModelOption[];
  /** 当前选中的模型 ID */
  selectedModel?: string;
  /** 是否显示模型选择器 */
  showModelSelector?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名配置 */
  classNames?: Partial<Record<SenderSemanticType, string>>;
  /** 语义化样式配置 */
  styles?: Partial<Record<SenderSemanticType, Record<string, string>>>;
  /** 草稿存储 key（默认 'aix_chat_draft'，设为 false 禁用草稿功能） */
  draftKey?: string | false;
}

/**
 * Sender 组件 Emits
 */
export interface SenderEmits {
  /** 值更新 */
  (e: 'update:value', value: string): void;
  /** 提交（普通模式只有 value，Slot/Skill 模式有 value 和 slotValues） */
  (
    e: 'submit',
    value: string,
    slotValues?: SlotValues,
    skill?: SkillConfig,
  ): void;
  /** 值变化 */
  (e: 'change', value: string): void;
  /** Slot 模式：slot 值变化 */
  (e: 'slotChange', slotValues: SlotValues): void;
  /** 技能切换 */
  (e: 'update:activeSkill', skillKey: string): void;
  /** 技能变化 */
  (e: 'skillChange', skill: SkillConfig): void;
  /** 语音开始 */
  (e: 'speechStart'): void;
  /** 语音结束 */
  (e: 'speechEnd', text: string): void;
  /** 语音错误 */
  (e: 'speechError', error: Error): void;
  /** 模型更新 */
  (e: 'update:selectedModel', modelId: string): void;
  /** 模型变化 */
  (e: 'modelChange', modelId: string): void;
}

/**
 * Sender.Header 展开方向
 */
export type SenderHeaderExpandDirection = 'up' | 'down';

/**
 * Sender.Header 展开触发器
 */
export type SenderHeaderExpandTrigger = 'click' | 'hover' | 'always';

/**
 * Sender.Header 组件 Props
 */
export interface SenderHeaderProps {
  /** 头部标题 */
  title?: string;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 是否默认展开 */
  defaultExpanded?: boolean;
  /** 受控展开状态 */
  expanded?: boolean;
  /** 展开方向 */
  direction?: SenderHeaderExpandDirection;
  /** 展开触发方式 */
  trigger?: SenderHeaderExpandTrigger;
  /** 展开时的最大高度 */
  maxHeight?: number | string;
  /** 是否显示分隔线 */
  showDivider?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 语义化类名 */
  classNames?: {
    root?: string;
    header?: string;
    title?: string;
    toggle?: string;
    content?: string;
    divider?: string;
  };
  /** 语义化样式 */
  styles?: {
    root?: Record<string, string>;
    header?: Record<string, string>;
    title?: Record<string, string>;
    toggle?: Record<string, string>;
    content?: Record<string, string>;
    divider?: Record<string, string>;
  };
}

/**
 * Sender.Header 组件 Emits
 */
export interface SenderHeaderEmits {
  /** 展开/折叠状态变化 */
  (e: 'toggle', expanded: boolean): void;
  /** 受控模式更新 */
  (e: 'update:expanded', expanded: boolean): void;
}
