import type {
  BucketsConfig,
  CIConfig,
  ExtractConfig,
  GlossaryConfig,
  IoConfig,
  KeysConfig,
  LLMTaskConfig,
  LocalesConfig,
  MergeConfig,
  PathPrefixStrategy,
} from './types';

// =============================================================================
// 默认值
//
// 设计要点：
//  - 主流项目命中率优先：localesDir 用 src/i18n、tImport 用 @/i18n
//  - 默认开 nested：现代 vue-i18n 项目主流
//  - 默认 separator='.'：与 nested 协同，避免新手撞 loader 错误
//  - 测试/Storybook 默认排除：避免无声提取测试文案
// =============================================================================

// ---- IO ----

/**
 * 默认 IO 配置。
 *
 * `exportDir` / `customDir` 不提供默认值：仅当用户显式配置后才启用——
 * `exportDir` 缺省即代表"工作目录就是运行时消费目录"，此时 export 命令被禁用。
 */
export const DEFAULT_IO: Required<Omit<IoConfig, 'exportDir' | 'customDir'>> = {
  sourceDir: 'src',
  localesDir: 'src/i18n',
  include: ['**/*.vue', '**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
  exclude: [
    'node_modules',
    'dist',
    'build',
    '.git',
    'public',
    '*.config.ts',
    '*.config.js',
    '*.config.mjs',
    '*.config.cjs',
    // 测试 / 故事 / mock：避免无声把测试文案提到 locale
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/__tests__/**',
    '**/__mocks__/**',
  ],
  format: 'nested',
  indent: 2,
  prettify: true,
};

// ---- Framework ----

/**
 * Vue 框架默认值（loader 始终用这些值填充，与 framework.type 无关）。
 */
export const DEFAULT_VUE_FRAMEWORK = {
  library: 'vue-i18n' as const,
  namespace: '',
  tImport: '@/i18n',
  /** Vue 不消费 includeDefaultMessage，但 ResolvedConfig 统一字段以简化下游消费 */
  includeDefaultMessage: false,
};

/**
 * React 框架默认值。
 */
export const DEFAULT_REACT_FRAMEWORK = {
  library: 'react-i18next' as const,
  namespace: '',
  tImport: '@/i18n',
  includeDefaultMessage: false,
};

// ---- Locales ----

/**
 * 默认语言配置。
 *
 * 用完整 BCP-47 长码 'zh-CN' / 'en-US' 作为默认，含区域信息更明确；
 * 表对长短码均已覆盖。
 */
export const DEFAULT_LOCALES: Required<Omit<LocalesConfig, 'names'>> &
  Pick<LocalesConfig, 'names'> = {
  source: 'zh-CN',
  targets: ['en-US'],
  names: {},
};

// ---- Keys ----

/**
 * 内置中文兜底映射表。仅当 `keys.fallback.extend=true` 时与用户配置合并。
 *
 * 设计：LLM 接管 ID 生成后此表很少被命中，但 skip-llm / LLM 失败时仍是兜底必备。
 */
export const BUILTIN_CN_MAPPINGS: Record<string, string> = {
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
};

/**
 * 默认前缀策略：从 src 起、不限层级、不带文件名。
 *
 * 默认行为：
 * - preserveHyphens=true：保留 kebab 目录名，主流项目大量使用
 * - indexFile='collapse-to-parent'：includeFile=true 时 `index.*` 折叠到父目录（与 Vue/React 习惯一致）
 */
export const DEFAULT_PREFIX_STRATEGY: Required<Omit<PathPrefixStrategy, 'transform'>> = {
  strategy: 'path',
  anchor: 'src',
  skip: 0,
  take: 0,
  includeFile: false,
  fileNameCase: 'camel',
  preserveHyphens: true,
  indexFile: 'collapse-to-parent',
};

/**
 * 默认 Keys 配置。
 */
export const DEFAULT_KEYS: {
  separator: string;
  prefix: typeof DEFAULT_PREFIX_STRATEGY;
  fallback: Required<NonNullable<KeysConfig['fallback']>>;
  reuse: {
    acrossDirectories: boolean;
    promoteToCommon: { threshold: number; namespace: string };
  };
  dynamicKeyAllowlist: (string | RegExp)[];
} = {
  separator: '.',
  prefix: DEFAULT_PREFIX_STRATEGY,
  fallback: {
    extend: true,
    mappings: {},
  },
  reuse: {
    acrossDirectories: false,
    // threshold=0 表示未启用，loader/resolver 据此跳过提升逻辑
    promoteToCommon: { threshold: 0, namespace: 'common' },
  },
  dynamicKeyAllowlist: [],
};

// ---- Extract ----

/**
 * 默认文本提取扩展配置。
 */
export const DEFAULT_EXTRACT: Required<ExtractConfig> = {
  filterPatterns: [],
};

// ---- Glossary ----

/**
 * 默认词表配置。
 *
 * 仅当用户配置了 glossary.file 时才会启用词表功能；
 * 未启用时 override / normalize 也不生效。
 */
export const DEFAULT_GLOSSARY: Required<Omit<GlossaryConfig, 'file'>> = {
  override: 'always',
  normalize: true,
};

// ---- LLM ----

/**
 * 默认 LLM 任务配置。
 *
 * idGeneration / translation 各自独立维护一份默认，避免一处改动影响另一处。
 * 当前两者默认值相同；保留两个常量是为了将来差异化（如翻译用更大并发）。
 */
export const DEFAULT_LLM_TASK: Required<
  Omit<LLMTaskConfig, 'apiKey' | 'baseURL' | 'model' | 'headers' | 'prompt'>
> = {
  timeout: 60_000,
  maxRetries: 2,
  temperature: 0.1,
  concurrency: 5,
  batchSize: 30,
  throttleMs: 500,
};

/** 默认 LLM 模型 */
export const DEFAULT_LLM_MODEL = 'gpt-4o';

// ---- Buckets ----

/**
 * 默认分桶配置（仅当用户启用 buckets 后才生效）。
 */
export const DEFAULT_BUCKETS: Required<Omit<BucketsConfig, 'rules'>> = {
  defaultBucket: 'common',
  emitManifest: true,
  layout: 'by-locale',
};

// ---- Merge ----

/**
 * 默认合并策略。
 *
 * 'fallback-to-source'：LLM 拒收条目（如纯标点）用源文本回填到目标语言文件，
 * 避免运行时显示 key 字符串。
 */
export const DEFAULT_MERGE: Required<MergeConfig> = {
  onLlmRejected: 'fallback-to-source',
};

// ---- CI ----

/**
 * 默认 CI 配置。
 *
 * coverageThreshold 不提供默认值：未配置 = 不卡覆盖率。
 */
export const DEFAULT_CI: CIConfig = {};
