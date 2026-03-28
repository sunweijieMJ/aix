import type { AnyExtension } from '@tiptap/core';
import type { Editor } from '@tiptap/vue-3';
import type { Ref } from 'vue';

// ========== 工具栏下拉选项 ==========

/** 下拉菜单选项 */
export interface DropdownOption {
  label: string;
  value: string;
}

// ========== 上传错误 ==========

/** 上传/查询错误信息 */
export interface UploadError {
  /** 错误类型 */
  type: 'size' | 'type' | 'network' | 'server' | 'custom';
  /** 错误消息 */
  message: string;
  /** 原始错误对象 */
  cause?: unknown;
}

/** 请求头配置（对象或函数，函数形式支持动态 token） */
export type HeadersConfig =
  | Record<string, string>
  | (() => Record<string, string>);

/** 附加表单字段 */
export type ExtraDataConfig =
  | Record<string, string | Blob>
  | ((file: File) => Record<string, string | Blob>);

// ========== 输出格式 ==========

/** 编辑器内容输出格式 */
export type OutputFormat = 'html' | 'json' | 'text';

// ========== 增强功能配置类型 ==========

/** 表格功能配置 */
export interface TableConfig {
  /** 是否可调整列宽 @default true */
  resizable?: boolean;
}

// ===== 上传公共配置 =====

/** 图片/视频上传的公共配置基类型 */
export interface BaseUploadConfig {
  // ===== 选择/上传方式（三选一，customPicker > upload > server） =====

  /**
   * 自定义选择器：完全替代原生文件选择和上传流程（优先级最��）
   * 由业务方控制 UI（如弹出资源库弹窗），返回资源 URL 或 null（取消）
   */
  customPicker?: () => Promise<string | null>;
  /** 自定义上传回调，返回文件 URL */
  upload?: (file: File) => Promise<string>;
  /** 服务端上传地址（当 upload 未提供时生效） */
  server?: string;

  // ===== server 模式配置 =====

  /** 自定义请求头 */
  headers?: HeadersConfig;
  /** 文件字段名 @default 'file' */
  fieldName?: string;
  /** 附加表单字段 */
  data?: ExtraDataConfig;
  /** 是否携带 cookie @default false */
  withCredentials?: boolean;
  /** 超时时间（ms） */
  timeout?: number;
  /** 从响应 JSON 中提取 URL 的点分路径 @default 'data.url' */
  responsePath?: string;

  // ===== 生命周期钩子 =====

  /** 上传前钩子：返回 false 阻止上传，返回 File 替换文件（可做压缩/重命名） */
  beforeUpload?: (file: File) => boolean | File | Promise<boolean | File>;
  /** 上传成功回调 */
  onSuccess?: (url: string, file: File) => void;
  /** 上传失败回调 */
  onError?: (error: UploadError, file: File) => void;

  // ===== 文件校验 =====

  /** 允许的文件类型 */
  acceptedTypes?: string[];
  /** 最大文件大小（字节） */
  maxSize?: number;
}

/** 图片功能配置（timeout 默认 30000，maxSize 默认 5MB） */
export interface ImageConfig extends BaseUploadConfig {
  /** 是否允许 base64 内联 @default false */
  allowBase64?: boolean;
}

/** 视频功能配置（timeout 默认 60000，maxSize 默认 100MB） */
export interface VideoConfig extends BaseUploadConfig {}

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
  // ===== 查询方式（二选一，queryItems 优先） =====

  /** 自定义查询回调（优先级最高） */
  queryItems?: (query: string) => Promise<MentionItem[]> | MentionItem[];
  /** 服务端查询地址（当 queryItems 未提供时生效，GET 请求） */
  server?: string;

  // ===== server 模式配置 =====

  /** 自定义请求头 */
  headers?: HeadersConfig;
  /** 查询参数名 @default 'keyword' */
  queryParamName?: string;
  /** 从响应 JSON 中提取列表的点分路径 @default 'data' */
  responsePath?: string;
  /** 将后端返回数据映射为 MentionItem */
  transformResponse?: (data: unknown[]) => MentionItem[];
  /** 查询失败回调 */
  onError?: (error: UploadError) => void;

  // ===== 显示配置 =====

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
   * 图片功能（需配置 upload 回调或 server 地址）
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
   * @提及功能（需配置 queryItems 回调或 server 地址）
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
