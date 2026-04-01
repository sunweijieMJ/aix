import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Ref } from 'vue';

/** Lint 配置选项 */
export interface CodeEditorLintConfig {
  /**
   * 检查延迟（毫秒），文档变更后等待多久执行 lint
   * @default 750
   */
  delay?: number;
}

/** 支持的编程语言 */
export type CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'cpp'
  | 'php'
  | 'sql'
  | 'yaml'
  | 'xml'
  | 'markdown'
  | 'sass'
  | 'vue'
  | 'angular'
  | 'liquid'
  | 'wast';

/** 编辑器主题 */
export type CodeEditorTheme = 'light' | 'dark';

/** CodeEditor 组件 Props */
export interface CodeEditorProps {
  /**
   * 编辑器内容（v-model 双向绑定）
   */
  modelValue?: string;

  /**
   * 编程语言
   * @default 'javascript'
   */
  language?: CodeLanguage;

  /**
   * 主题
   * @default 'light'
   */
  theme?: CodeEditorTheme;

  /**
   * 是否只读（保留光标，不可编辑）
   * @default false
   */
  readonly?: boolean;

  /**
   * 是否禁用（完全不可交互）
   * @default false
   */
  disabled?: boolean;

  /**
   * 占位文本
   */
  placeholder?: string;

  /**
   * 是否显示行号
   * @default true
   */
  lineNumbers?: boolean;

  /**
   * 是否启用代码折叠
   * @default true
   */
  foldGutter?: boolean;

  /**
   * 是否高亮当前行
   * @default true
   */
  highlightActiveLine?: boolean;

  /**
   * 是否启用括号匹配
   * @default true
   */
  bracketMatching?: boolean;

  /**
   * Tab 缩进大小
   * @default 2
   */
  tabSize?: number;

  /**
   * 编辑器固定高度（CSS 值，如 '400px'）
   */
  height?: string;

  /**
   * 编辑器最小高度
   * @default '100px'
   */
  minHeight?: string;

  /**
   * 编辑器最大高度
   */
  maxHeight?: string;

  /**
   * 是否启用语法校验
   * @default true
   */
  lint?: boolean;

  /**
   * 语法校验配置
   */
  lintOptions?: CodeEditorLintConfig;

  /**
   * 用户自定义 CodeMirror 扩展
   */
  extensions?: Extension[];
}

/** CodeEditor 组件 Emits */
export interface CodeEditorEmits {
  /** 内容变化（v-model） */
  (e: 'update:modelValue', value: string): void;
  /** 内容变化 */
  (e: 'change', value: string): void;
  /** 获得焦点 */
  (e: 'focus', view: EditorView): void;
  /** 失去焦点 */
  (e: 'blur', view: EditorView): void;
  /** 编辑器就绪 */
  (e: 'ready', view: EditorView): void;
}

/** CodeEditor 暴露的方法和状态 */
export interface CodeEditorExpose {
  /** EditorView 实例 */
  editorView: Ref<EditorView | null>;

  /** 是否获得焦点 */
  isFocused: Ref<boolean>;

  /** 获取编辑器内容 */
  getValue: () => string;
  /** 设置编辑器内容 */
  setValue: (value: string) => void;

  /** 聚焦编辑器 */
  focus: () => void;
  /** 取消聚焦 */
  blur: () => void;

  /** 获取选中文本 */
  getSelection: () => string;
  /** 替换选中内容 */
  replaceSelection: (text: string) => void;

  /** 在光标位置插入文本 */
  insert: (text: string) => void;

  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;

  /** 获取总行数 */
  getLineCount: () => number;
  /** 获取光标位置 */
  getCursorPosition: () => { line: number; col: number };

  /** 当前诊断（错误/警告）数量 */
  diagnosticCount: Ref<number>;
}
