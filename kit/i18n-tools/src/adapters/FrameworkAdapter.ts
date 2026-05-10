import type { ExtractedString, LocaleMap } from '../utils/types';

/**
 * 框架配置接口
 */
export interface FrameworkConfig {
  /** 框架类型 */
  type: 'react' | 'vue';
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
}

/**
 * 文本提取器抽象基类
 *
 * 提供 extractFromFiles 的默认串行实现，子类只需实现 extractFromFile。
 * 此前 Vue/React 两端各写一份相同的 for-await 样板，统一到本基类。
 */
export abstract class BaseTextExtractor implements ITextExtractor {
  abstract extractFromFile(filePath: string): Promise<ExtractedString[]>;

  async extractFromFiles(filePaths: string[]): Promise<ExtractedString[]> {
    const all: ExtractedString[] = [];
    for (const filePath of filePaths) {
      all.push(...(await this.extractFromFile(filePath)));
    }
    return all;
  }
}

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
   * 获取框架类型
   */
  getType(): 'react' | 'vue' {
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
   * 获取展示名。回退到 type 的首字母大写形式。
   */
  getDisplayName(): string {
    return this.config.displayName ?? (this.config.type === 'vue' ? 'Vue' : 'React');
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
