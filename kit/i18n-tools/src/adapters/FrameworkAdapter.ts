import type { ExtractedString, LocaleMap } from '../utils/types';

/**
 * 框架配置接口
 */
export interface FrameworkConfig {
  /** 框架类型 */
  type: 'react' | 'vue';
  /** 支持的文件扩展名 */
  extensions: string[];
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
 * 代码转换器接口
 */
export interface ITransformer {
  transform(
    filePath: string,
    extractedStrings: ExtractedString[],
    includeDefaultMessage: boolean,
  ): string;
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
  inject(code: string): string;
}

/**
 * 导入管理器接口
 */
export interface IImportManager {
  handleGlobalImports(
    code: string,
    fileStrings: ExtractedString[],
    filePath?: string,
  ): string;
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
