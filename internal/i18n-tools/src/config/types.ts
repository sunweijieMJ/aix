/**
 * LLM API 配置接口
 * 使用 OpenAI 兼容 API，通过 baseURL 支持 OpenAI/DeepSeek/Azure 等服务
 */
export interface LLMConfig {
  /** API 密钥 */
  apiKey: string;
  /** 模型名称，如 "gpt-4o"、"deepseek-chat" */
  model: string;
  /** API 地址（非 OpenAI 服务时需要设置，如 "https://api.deepseek.com"） */
  baseURL?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 温度参数，控制输出随机性，默认 0.1 */
  temperature?: number;
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
 * 语言配置
 */
export interface LocaleConfig {
  /** 源语言代码，默认 'zh-CN' */
  source?: string;
  /** 目标语言代码，默认 'en-US' */
  target?: string;
}

/**
 * 自定义提示词配置
 */
export interface PromptsConfig {
  /** ID 生成提示词 */
  idGeneration?: {
    /** 自定义 System Prompt（完全覆盖默认值） */
    system?: string;
    /** 自定义 User Prompt 模板，使用 {count} 和 {textList} 占位符 */
    user?: string;
  };
  /** 翻译提示词 */
  translation?: {
    /** 自定义 System Prompt（完全覆盖默认值） */
    system?: string;
    /** 自定义 User Prompt 模板，使用 {jsonText} 占位符 */
    user?: string;
  };
}

/**
 * ID 前缀配置
 */
export interface IdPrefixConfig {
  /** 锚点目录名，用于定位路径前缀的起始位置，默认 'src' */
  anchor?: string;
  /** 自定义固定前缀，设置后将替代自动提取的路径前缀 */
  value?: string;
  /** ID 分隔符，默认 '__' */
  separator?: string;
  /** 中文常用词映射表（用于本地 ID 兜底生成），默认内置 18 个常用词 */
  chineseMappings?: Record<string, string>;
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

  /** 语言配置（源语言和目标语言） */
  locale?: LocaleConfig;

  /** 语言文件路径配置 */
  paths: PathsConfig;

  /** LLM API 配置 */
  llm: {
    /** ID 生成接口 */
    idGeneration: LLMConfig;
    /** 翻译接口 */
    translation: LLMConfig;
  };

  /** 自定义 AI 提示词 */
  prompts?: PromptsConfig;

  /** ID 前缀配置 */
  idPrefix?: IdPrefixConfig;

  /** 并发控制 */
  concurrency?: ConcurrencyConfig;

  /** 翻译批次大小 */
  batchSize?: number;

  /** 翻译批次间延时（毫秒），默认 500 */
  batchDelay?: number;

  /** 转换后是否自动格式化代码（Prettier + ESLint），默认 true */
  format?: boolean;

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
  locale: Required<LocaleConfig>;
  paths: {
    locale: string;
    customLocale: string;
    exportLocale: string;
    source: string;
    tImport: string;
  };
  llm: {
    idGeneration: Required<Omit<LLMConfig, 'baseURL'>> &
      Pick<LLMConfig, 'baseURL'>;
    translation: Required<Omit<LLMConfig, 'baseURL'>> &
      Pick<LLMConfig, 'baseURL'>;
  };
  prompts: {
    idGeneration: { system?: string; user?: string };
    translation: { system?: string; user?: string };
  };
  idPrefix: Required<IdPrefixConfig>;
  concurrency: Required<ConcurrencyConfig>;
  batchSize: number;
  batchDelay: number;
  format: boolean;
  include: string[];
  exclude: string[];
}

/**
 * 辅助函数：定义配置（提供类型提示）
 */
export function defineConfig(config: I18nToolsConfig): I18nToolsConfig {
  return config;
}
