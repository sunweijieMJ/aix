import ts from 'typescript';

/**
 * 语言消息内容接口
 * 可以是字符串或嵌套的消息对象
 */
export interface ILangMsg {
  [key: string]: string | ILangMsg;
}

/**
 * 语言映射类型
 * 键为语言代码(如'zh-CN')，值为对应的语言消息
 */
export type ILangMap = Record<string, ILangMsg>;

/**
 * 翻译数据接口定义
 */
export interface Translations {
  [key: string]: {
    [locale: string]: string;
  };
}

/**
 * 提取的字符串信息接口（框架无关）
 */
export interface ExtractedString {
  /** 原始文本（用于转换时匹配源代码） */
  original: string;
  /** 处理后的消息文本（字面量已内联，用于locale文件和生成ID） */
  processedMessage?: string;
  semanticId: string;
  filePath: string;
  line: number;
  column: number;
  /** 上下文类型（框架特定） */
  context: 'jsx-text' | 'jsx-attribute' | 'js-code' | 'template' | 'script';
  /** 组件类型（框架特定） */
  componentType: 'function' | 'class' | 'setup' | 'options' | 'other';
  isTemplateString?: boolean;
  templateVariables?: string[];
  /** Vue template 详细上下文 */
  templateContext?:
    | 'text-node'
    | 'static-attribute'
    | 'dynamic-attribute'
    | 'interpolation';
  /** 属性名称（用于静态属性转动态绑定） */
  attributeName?: string;
}

/**
 * 语言映射类型（简化版本）
 */
export type LocaleMap = Record<string, string>;

/**
 * 操作模式枚举
 */
export enum ModeName {
  /** 代码生成模式 - 扫描源码文件，提取中文文本并生成国际化调用代码 */
  GENERATE = 'generate',
  /** 提取模式 - 从现有国际化文件中提取未翻译的条目，生成待翻译文件 */
  PICK = 'pick',
  /** 翻译模式 - 调用AI翻译服务，将待翻译文件中的中文翻译为英文 */
  TRANSLATE = 'translate',
  /** 合并模式 - 将翻译完成的文件合并回主国际化文件 */
  MERGE = 'merge',
  /** 还原模式 - 将国际化调用代码还原为原始中文文本（用于调试） */
  RESTORE = 'restore',
  /** 导出模式 - 合并基础和定制国际化文件，生成最终语言包 */
  EXPORT = 'export',
  /** 自动模式 - 串行执行generate、pick、translate、merge、export */
  AUTOMATIC = 'automatic',
}

/**
 * 消息信息接口
 */
export interface MessageInfo {
  id?: string;
  defaultMessage?: string;
  values?: Record<string, any>;
}

/**
 * 还原操作的转换上下文接口
 */
export interface TransformContext {
  /** 语言映射 */
  localeMap: LocaleMap;
  /** 定义的消息映射 */
  definedMessages: Map<string, MessageInfo>;
  /** 是否有变更 */
  hasChanges: boolean;
  /** 源文件 */
  sourceFile: ts.SourceFile;
  componentNameMap: Map<string, string>;
}
