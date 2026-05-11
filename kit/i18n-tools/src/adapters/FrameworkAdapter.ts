import type { ExtractedString, LocaleMap } from '../utils/types';

/**
 * 框架配置接口
 *
 * `type` 抽象层不再绑定到具体的框架字面量联合，新增框架时只需扩展具体 Adapter
 * 与 `createFrameworkAdapter` 工厂分支，无需修改本基类。封闭枚举仍保留在
 * `config/types.ts` 的用户输入边界。
 */
export interface FrameworkConfig {
  /** 框架类型（与 `config.framework` 保持一致；抽象层不约束字面量） */
  type: string;
  /** 支持的文件扩展名（含点号，如 '.tsx'） */
  extensions: string[];
  /** 框架展示名（用于日志/错误提示，如 'Vue'、'React'） */
  displayName?: string;
  /** i18n 库名称 */
  i18nLibrary: string;
  /** 全局函数名称（如 $t, getIntl） */
  globalFunctionName?: string;
  /** Hook 名称（如 useI18n, useIntl） */
  hookName?: string;
}

/**
 * 文本提取器接口
 */
export interface ITextExtractor {
  extractFromFile(filePath: string): Promise<ExtractedString[]>;
  extractFromFiles(filePaths: string[]): Promise<ExtractedString[]>;
  /**
   * 取出并清空提取过程中累积的 warning（如跳过含 HTML 的模板字符串）。
   * 调用方（GenerateProcessor）负责把 warning 写入 RunReport 以供事后回查。
   */
  drainWarnings(): string[];
}

// BaseTextExtractor 的实现已下沉至 strategies/base/text-extractor.ts，
// 维持"策略层提供具体实现、适配器层定义抽象接口"的分层语义。

/**
 * 代码转换器接口
 *
 * library 级别的转换选项（如 React 的 includeDefaultMessage）通过具体实现
 * 类的构造器传入，不在公共接口中暴露，避免框架特定参数污染抽象层。
 */
export interface ITransformer {
  transform(filePath: string, extractedStrings: ExtractedString[]): string;
}

/**
 * 还原转换器接口
 */
export interface IRestoreTransformer {
  transform(filePath: string, localeMap: LocaleMap): string;
}

/**
 * 组件注入器接口
 */
export interface IComponentInjector {
  /**
   * @param code - 待注入的源代码
   * @param filePath - 原始文件路径（用于决定 ScriptKind，避免纯 .ts 文件被按 TSX 解析）
   */
  inject(code: string, filePath?: string): string;
}

/**
 * 导入管理器接口
 */
export interface IImportManager {
  handleGlobalImports(code: string, fileStrings: ExtractedString[], filePath?: string): string;
  addI18nImports(code: string, imports: string[]): string;
}

/**
 * 框架适配器抽象基类
 * 定义所有框架适配器必须实现的接口
 */
export abstract class FrameworkAdapter {
  protected config: FrameworkConfig;

  constructor(config: FrameworkConfig) {
    this.config = config;
  }

  /**
   * 获取框架配置
   */
  getConfig(): FrameworkConfig {
    return this.config;
  }

  /**
   * 获取框架类型（具体值由各 Adapter 在 FrameworkConfig 中提供）
   */
  getType(): string {
    return this.config.type;
  }

  /**
   * 获取支持的文件扩展名列表（含点号）。
   * 用于扫描目录、校验目标文件，使工具层不再硬编码框架。
   */
  getSupportedExtensions(): string[] {
    return this.config.extensions;
  }

  /**
   * 获取展示名。未显式提供时按 `type` 的首字母大写形式回退（如 'svelte' → 'Svelte'）。
   */
  getDisplayName(): string {
    if (this.config.displayName) return this.config.displayName;
    const t = this.config.type;
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  /**
   * 获取当前选用的 i18n 库标识（如 'vue-i18n'、'react-i18next'）。
   * CLI / 日志层使用，避免在外层做 `framework === 'vue' ? config.vue.library : config.react.library`
   * 的硬编码分支——新增框架时该接口由各自适配器自然提供。
   */
  getLibraryName(): string {
    return this.config.i18nLibrary;
  }

  /**
   * 获取文本提取器
   */
  abstract getTextExtractor(): ITextExtractor;

  /**
   * 获取代码转换器
   */
  abstract getTransformer(): ITransformer;

  /**
   * 获取还原转换器
   */
  abstract getRestoreTransformer(): IRestoreTransformer;

  /**
   * 获取组件注入器
   */
  abstract getComponentInjector(): IComponentInjector;

  /**
   * 获取导入管理器
   */
  abstract getImportManager(): IImportManager;
}
