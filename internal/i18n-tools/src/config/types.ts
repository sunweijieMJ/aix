/**
 * Dify API 配置接口
 */
export interface DifyApiConfig {
  /** API 地址 */
  url: string;
  /** API 密钥 */
  apiKey: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * 路径配置接口
 */
export interface PathsConfig {
  /** 主语言文件目录，相对于 rootDir */
  locale: string;
  /** 自定义语言文件目录，相对于 rootDir */
  customLocale?: string;
  /** 导出目录，相对于 rootDir */
  exportLocale?: string;
  /** 源代码扫描目录，相对于 rootDir */
  source: string;
}

/**
 * 并发控制配置
 */
export interface ConcurrencyConfig {
  /** ID 生成最大并发数 */
  idGeneration?: number;
  /** 翻译最大并发数 */
  translation?: number;
}

/**
 * i18n-tools 完整配置接口
 */
export interface I18nToolsConfig {
  /** 项目根目录（绝对路径） */
  rootDir: string;

  /** 框架类型 */
  framework: 'vue' | 'react';

  /** 语言文件路径配置 */
  paths: PathsConfig;

  /** Dify API 配置 */
  dify: {
    /** ID 生成接口 */
    idGeneration: DifyApiConfig;
    /** 翻译接口 */
    translation: DifyApiConfig;
  };

  /** 并发控制 */
  concurrency?: ConcurrencyConfig;

  /** 翻译批次大小 */
  batchSize?: number;

  /** 文件过滤 glob 模式 */
  include?: string[];
  /** 排除的目录或文件 */
  exclude?: string[];
}

/**
 * 已解析的配置（所有路径为绝对路径，可选项已填默认值）
 */
export interface ResolvedConfig {
  rootDir: string;
  framework: 'vue' | 'react';
  paths: {
    locale: string;
    customLocale: string;
    exportLocale: string;
    source: string;
  };
  dify: {
    idGeneration: Required<DifyApiConfig>;
    translation: Required<DifyApiConfig>;
  };
  concurrency: Required<ConcurrencyConfig>;
  batchSize: number;
  include: string[];
  exclude: string[];
}

/**
 * 辅助函数：定义配置（提供类型提示）
 */
export function defineConfig(config: I18nToolsConfig): I18nToolsConfig {
  return config;
}
