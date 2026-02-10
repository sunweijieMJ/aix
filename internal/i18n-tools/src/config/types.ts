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
  /** .ts/.js 文件中 t 函数的导入路径，如 '@/plugins/i18n' */
  tImport?: string;
}

/**
 * ID 前缀配置
 */
export interface IdPrefixConfig {
  /** 锚点目录名，用于定位路径前缀的起始位置，默认 'src' */
  anchor?: string;
  /** 自定义固定前缀，设置后将替代自动提取的路径前缀 */
  value?: string;
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
 * Vue 框架专用配置
 */
export interface VueConfig {
  /** i18n 库选择，默认 'vue-i18n' */
  library?: 'vue-i18n' | 'vue-i18next';
  /** vue-i18next 命名空间（仅 vue-i18next 生效） */
  namespace?: string;
}

/**
 * React 框架专用配置
 */
export interface ReactConfig {
  /** i18n 库选择，默认 'react-i18next' */
  library?: 'react-intl' | 'react-i18next';
  /** react-i18next 命名空间（仅 react-i18next 生效） */
  namespace?: string;
}

/**
 * i18n-tools 完整配置接口
 */
export interface I18nToolsConfig {
  /** 项目根目录（绝对路径） */
  rootDir: string;

  /** 框架类型 */
  framework: 'vue' | 'react';

  /** Vue 框架专用配置 */
  vue?: VueConfig;

  /** React 框架专用配置 */
  react?: ReactConfig;

  /** 语言文件路径配置 */
  paths: PathsConfig;

  /** Dify API 配置 */
  dify: {
    /** ID 生成接口 */
    idGeneration: DifyApiConfig;
    /** 翻译接口 */
    translation: DifyApiConfig;
  };

  /** ID 前缀配置 */
  idPrefix?: IdPrefixConfig;

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
  vue: Required<VueConfig>;
  react: Required<ReactConfig>;
  paths: {
    locale: string;
    customLocale: string;
    exportLocale: string;
    source: string;
    tImport: string;
  };
  dify: {
    idGeneration: Required<DifyApiConfig>;
    translation: Required<DifyApiConfig>;
  };
  idPrefix: Required<IdPrefixConfig>;
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
