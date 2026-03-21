import type { AnyExtension } from '@tiptap/core';
import type { Editor } from '@tiptap/vue-3';
import type { Ref } from 'vue';

// ========== 工具栏下拉选项 ==========

/** 下拉菜单选项 */
export interface DropdownOption {
  label: string;
  value: string;
}

// ========== 输出格式 ==========

/** 编辑器内容输出格式 */
export type OutputFormat = 'html' | 'json' | 'text';

// ========== 增强功能配置类型 ==========

/** 表格功能配置 */
export interface TableConfig {
  /** 是否可调整列宽 @default true */
  resizable?: boolean;
}

/** 图片功能配置 */
export interface ImageConfig {
  /** 图片上传回调，返回图片 URL */
  upload: (file: File) => Promise<string>;
  /** 允许的文件类型 @default ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] */
  acceptedTypes?: string[];
  /** 最大文件大小（字节） @default 5 * 1024 * 1024 */
  maxSize?: number;
  /** 是否允许 base64 内联 @default false */
  allowBase64?: boolean;
}

/** 视频功能配置 */
export interface VideoConfig {
  /** 自定义视频上传回调，返回视频 URL */
  upload?: (file: File) => Promise<string>;
}

/** 字体大小配置 */
export interface FontSizeConfig {
  /** 可选字号列表 @default ['12px','14px','16px','18px','20px','24px','28px','32px'] */
  sizes?: string[];
}

/** 字体族配置 */
export interface FontFamilyConfig {
  /** 可选字体列表 */
  families?: Array<{ label: string; value: string }>;
}

/** @提及项 */
export interface MentionItem {
  id: string | number;
  label: string;
  [key: string]: unknown;
}

/** @提及配置 */
export interface MentionConfig {
  /** 数据源查询回调 */
  queryItems: (query: string) => Promise<MentionItem[]> | MentionItem[];
  /** 渲染提及项的标签 */
  renderLabel?: (item: MentionItem) => string;
  /** 触发字符 @default '@' */
  trigger?: string;
}

/** 字符统计配置 */
export interface CharacterCountConfig {
  /** 最大字符数 */
  limit?: number;
  /** 统计模式 @default 'textSize' */
  mode?: 'textSize' | 'nodeSize';
}

// ========== 主 Props ==========

export interface RichTextEditorProps {
  /**
   * 编辑器内容（v-model 双向绑定）
   * HTML 字符串或 JSON 对象
   */
  modelValue?: string | Record<string, unknown>;

  /**
   * 内容输出格式
   * @default 'html'
   */
  outputFormat?: OutputFormat;

  /**
   * 是否只读
   * @default false
   */
  readonly?: boolean;

  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;

  /**
   * 占位文本
   * @default ''
   */
  placeholder?: string;

  /**
   * 是否自动聚焦
   * @default false
   */
  autofocus?: boolean;

  /**
   * 编辑器固定高度（CSS 值）
   */
  height?: string;

  /**
   * 编辑器最小高度
   * @default '200px'
   */
  minHeight?: string;

  /**
   * 编辑器最大高度
   */
  maxHeight?: string;

  /**
   * 是否显示 Toolbar
   * @default true
   */
  showToolbar?: boolean;

  /**
   * 用户自定义 Tiptap 扩展（完全开放的扩展接口）
   */
  extensions?: AnyExtension[];

  /**
   * 语言覆盖（优先于全局 locale）
   */
  locale?: 'zh-CN' | 'en-US';

  // ===== 14 项增强功能（全部可选，默认不启用） =====

  /**
   * 表格功能
   */
  table?: boolean | TableConfig;

  /**
   * 任务列表（可勾选的 TODO 列表）
   */
  taskList?: boolean;

  /**
   * 图片功能（需要 upload 回调）
   */
  image?: ImageConfig;

  /**
   * 视频功能
   */
  video?: boolean | VideoConfig;

  /**
   * 文本对齐（左/中/右/两端）
   */
  textAlign?: boolean;

  /**
   * 文本颜色 + 高亮背景
   */
  textColor?: boolean;

  /**
   * 字体大小
   */
  fontSize?: boolean | FontSizeConfig;

  /**
   * 字体族
   */
  fontFamily?: boolean | FontFamilyConfig;

  /**
   * 上标/下标
   */
  superscriptSubscript?: boolean;

  /**
   * 字符统计
   */
  characterCount?: boolean | CharacterCountConfig;

  /**
   * @提及功能（需要 queryItems 回调）
   */
  mention?: MentionConfig;

  /**
   * 高亮标记
   */
  highlight?: boolean;

  /**
   * Markdown 输入支持
   */
  markdown?: boolean;
}

// ========== Emits ==========

export interface RichTextEditorEmits {
  /** v-model 更新 */
  (e: 'update:modelValue', value: string | Record<string, unknown>): void;
  /** 内容变化 */
  (e: 'change', value: string | Record<string, unknown>): void;
  /** 获得焦点 */
  (e: 'focus', event: FocusEvent): void;
  /** 失去焦点 */
  (e: 'blur', event: FocusEvent): void;
  /** 编辑器就绪 */
  (e: 'ready', editor: Editor): void;
  /** 字符统计更新（需启用 characterCount） */
  (e: 'character-count', count: { characters: number; words: number }): void;
}

// ========== Expose ==========

export interface RichTextEditorExpose {
  /** Tiptap Editor 实例（供高级用户直接操作） */
  editor: Ref<Editor | null>;

  /** 获取 HTML 内容 */
  getHTML: () => string;
  /** 获取 JSON 内容 */
  getJSON: () => Record<string, unknown>;
  /** 获取纯文本 */
  getText: () => string;

  /** 设置内容 */
  setContent: (content: string | Record<string, unknown>) => void;
  /** 清空内容 */
  clearContent: () => void;

  /** 聚焦 */
  focus: (position?: 'start' | 'end' | 'all') => void;
  /** 取消聚焦 */
  blur: () => void;

  /** 插入内容 */
  insertContent: (content: string) => void;

  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;

  /** 获取字符数（需启用 characterCount） */
  getCharacterCount: () => number;
  /** 获取词数（需启用 characterCount） */
  getWordCount: () => number;

  /** 判断内容是否为空 */
  isEmpty: () => boolean;
}
