import type {
  ConcurrencyConfig,
  IdPrefixConfig,
  LocaleConfig,
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
