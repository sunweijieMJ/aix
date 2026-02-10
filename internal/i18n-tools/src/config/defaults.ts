import type {
  ConcurrencyConfig,
  IdPrefixConfig,
  PathsConfig,
  ReactConfig,
  VueConfig,
} from './types';

/**
 * 默认路径配置
 */
export const DEFAULT_PATHS: Required<PathsConfig> = {
  locale: 'src/locale',
  customLocale: 'src/overrides/locale',
  exportLocale: 'public/locale',
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
};

/**
 * 默认 ID 前缀配置
 */
export const DEFAULT_ID_PREFIX: Required<IdPrefixConfig> = {
  anchor: 'src',
  value: '',
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
 * 默认 Dify API 超时时间（毫秒）
 */
export const DEFAULT_DIFY_TIMEOUT = 60000;

/**
 * 默认文件包含模式
 */
export const DEFAULT_INCLUDE = [
  '**/*.vue',
  '**/*.tsx',
  '**/*.jsx',
  '**/*.ts',
  '**/*.js',
];

/**
 * 默认排除目录
 */
export const DEFAULT_EXCLUDE = [
  'node_modules',
  'dist',
  'build',
  '.git',
  'public',
];
