import type {
  ConcurrencyConfig,
  GlossaryConfig,
  IdPrefixConfig,
  LocaleConfig,
  PathsConfig,
  ReactConfig,
  VueConfig,
} from './types';

/**
 * 默认路径配置
 *
 * `customLocale` / `exportLocale` / `glossary` 不提供默认值：仅当用户在 i18n.config 中
 * 显式配置后才启用——`exportLocale` 缺省即代表"工作目录就是运行时消费目录"，
 * 此时 export 命令被禁用，避免对不存在的目录或文件产生误导性日志。
 */
export const DEFAULT_PATHS: Required<
  Omit<PathsConfig, 'customLocale' | 'exportLocale' | 'glossary'>
> = {
  locale: 'src/locale',
  source: 'src',
  tImport: '@/plugins/locale',
};

/**
 * 默认 Vue 配置
 */
export const DEFAULT_VUE: Required<VueConfig> = {
  library: 'vue-i18n',
  namespace: '',
};

/**
 * 默认 React 配置
 */
export const DEFAULT_REACT: Required<ReactConfig> = {
  library: 'react-i18next',
  namespace: '',
  includeDefaultMessage: false,
};

/**
 * 默认语言配置
 */
export const DEFAULT_LOCALE: Required<LocaleConfig> = {
  source: 'zh-CN',
  target: 'en-US',
};

/**
 * 默认 ID 前缀配置
 */
export const DEFAULT_ID_PREFIX: Required<IdPrefixConfig> = {
  anchor: 'src',
  value: '',
  separator: '__',
  chineseMappings: {
    确认: 'confirm',
    取消: 'cancel',
    删除: 'delete',
    添加: 'add',
    编辑: 'edit',
    保存: 'save',
    提交: 'submit',
    搜索: 'search',
    登录: 'login',
    退出: 'logout',
    成功: 'success',
    失败: 'failed',
    错误: 'error',
    警告: 'warning',
    提示: 'tip',
    用户: 'user',
    请输入: 'please_input',
    请选择: 'please_select',
  },
  reuseAcrossDirectories: false,
  maxDepth: 0,
};

/**
 * 默认词表配置
 *
 * 仅当用户在 i18n.config 中配置了 paths.glossary 时才会启用词表功能；
 * 未启用时 override / normalize 也不生效。
 */
export const DEFAULT_GLOSSARY: Required<GlossaryConfig> = {
  override: 'always',
  normalize: true,
};

/**
 * 默认并发配置
 */
export const DEFAULT_CONCURRENCY: Required<ConcurrencyConfig> = {
  idGeneration: 5,
  translation: 3,
};

/**
 * 默认翻译批次大小
 */
export const DEFAULT_BATCH_SIZE = 10;

/**
 * 默认翻译批次间延时（毫秒）
 */
export const DEFAULT_BATCH_DELAY = 500;

/**
 * 默认 LLM API 超时时间（毫秒）
 */
export const DEFAULT_LLM_TIMEOUT = 60000;

/**
 * 默认 LLM 模型
 */
export const DEFAULT_LLM_MODEL = 'gpt-4o';

/**
 * 默认 LLM 最大重试次数
 */
export const DEFAULT_LLM_MAX_RETRIES = 2;

/**
 * 默认 LLM 温度参数
 */
export const DEFAULT_LLM_TEMPERATURE = 0.1;

/**
 * 默认文件包含模式
 */
export const DEFAULT_INCLUDE = ['**/*.vue', '**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'];

/**
 * 默认排除：含目录名（精确匹配）与文件 glob（仅 `*`/`?`）。
 *
 * - 排除常见构建产物 / 版本控制目录
 * - 排除根目录的工具配置文件，例如 vite.config.ts / tailwind.config.js / i18n.config.ts，
 *   这些文件即使含中文注释也不应被处理为业务源码
 */
export const DEFAULT_EXCLUDE = [
  'node_modules',
  'dist',
  'build',
  '.git',
  'public',
  '*.config.ts',
  '*.config.js',
  '*.config.mjs',
  '*.config.cjs',
];

/**
 * 模块化导出默认值（仅当用户启用 modules 后才生效）
 */
export const DEFAULT_MODULES_DEFAULT_MODULE = 'common';
export const DEFAULT_MODULES_MANIFEST = true;
export const DEFAULT_MODULES_LAYOUT = 'by-locale' as const;

/**
 * 默认导出格式
 */
export const DEFAULT_OUTPUT_FORMAT = 'flat' as const;
