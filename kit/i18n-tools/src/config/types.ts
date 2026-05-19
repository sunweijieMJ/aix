// =============================================================================
// i18n-tools 配置接口
//
// 设计原则：
//  - 职能聚合：相关字段同容器，避免跨顶层跳跃
//  - 命名消歧：*Dir 表目录、*File 表文件
//  - 显式枚举优于隐式状态机：keys.prefix.strategy 而非 value 静默覆盖 anchor
//  - 预留扩展轴：locales.targets 数组化；framework.type 字符串而非封闭 union
// =============================================================================

// ============ 1. 框架 ============

/**
 * Vue 框架专属字段。`type='vue'` 时启用。
 */
export interface VueFrameworkOptions {
  type: 'vue';
  /** i18n 库选择 */
  library?: 'vue-i18n' | 'vue-i18next';
  /** i18next 命名空间（仅 vue-i18next 生效） */
  namespace?: string;
  /** t() 函数导入路径，如 '@/i18n' */
  tImport?: string;
}

/**
 * React 框架专属字段。`type='react'` 时启用。
 */
export interface ReactFrameworkOptions {
  type: 'react';
  /** i18n 库选择 */
  library?: 'react-intl' | 'react-i18next';
  /** i18next 命名空间（仅 react-i18next 生效） */
  namespace?: string;
  /** t() 函数导入路径 */
  tImport?: string;
  /**
   * 是否在生成的 i18n 调用中携带 defaultMessage（react-intl 等需要源文本兜底时使用）。
   * 默认 false。
   */
  includeDefaultMessage?: boolean;
}

/**
 * 框架配置（判别 union）。
 *
 * 抽象层（FrameworkAdapter）保持开放，新增框架时扩展本 union 即可——
 * 用户层 type 仍是闭合 union 以提供类型补全。
 */
export type FrameworkConfig = VueFrameworkOptions | ReactFrameworkOptions;

// ============ 2. 语言 ============

/**
 * 语言配置。
 *
 * targets 是数组以支持多目标语种。所有翻译/词表/落盘逻辑会对每个 target 单独处理。
 */
export interface LocalesConfig {
  /** 源语言代码，默认 'zh' */
  source?: string;
  /** 目标语言代码列表，默认 ['en']。数组化以支持多目标。 */
  targets?: string[];
  /**
   * 语言代码 → 展示名映射，会与内置 LOCALE_NAMES 合并后注入 LLM prompt。
   * 用户配置优先级高于内置表。
   */
  names?: Record<string, string>;
}

// ============ 3. IO ============

/**
 * IO 配置：所有目录 / 扫描 / 落盘相关字段聚合于此。
 */
export interface IoConfig {
  /** 源代码扫描根目录，相对 root */
  sourceDir?: string;
  /** 主语言文件工作目录，相对 root */
  localesDir?: string;
  /** 独立发布目录，相对 root；未设置时禁用 export 命令 */
  exportDir?: string;
  /** 自定义译文 override 目录，相对 root；未设置时 --custom 不可用 */
  customDir?: string;
  /** 文件包含 glob */
  include?: string[];
  /** 文件排除 glob */
  exclude?: string[];
  /**
   * 语言文件序列化格式：
   * - 'flat'：扁平 key/value
   * - 'nested'：按 keys.separator 拆分为树形 JSON（要求 separator='.'）
   */
  format?: 'flat' | 'nested';
  /** JSON 缩进字符数，默认 2 */
  indent?: number;
  /** 是否过 Prettier 美化生成的源码与 JSON，默认 true */
  prettify?: boolean;
}

// ============ 4. Keys（前缀派生 + 语义兜底 + 复用） ============

/**
 * 前缀派生上下文（供 transform / resolve 回调使用）
 */
export interface PrefixContext {
  /** 当前文件的绝对路径 */
  filePath: string;
  /** 项目根目录绝对路径（同 ResolvedConfig.root） */
  root: string;
  /** 配置中的 anchor */
  anchor: string;
}

/**
 * 路径派生策略：从 anchor 之后的目录段派生前缀。
 *
 * 例（anchor='src', skip=0, take=3）：
 *   src/pages/flipped-course/components/Map2D.vue
 *     → ['pages', 'flipped-course', 'components']
 *
 * skip / take 用于跳过壳目录或限制深度；
 * includeFile=true 时把文件名（去扩展名）作为最后一段；
 * transform 函数可对每段做映射或过滤（返回 null 删除该段）。
 */
export interface PathPrefixStrategy {
  strategy: 'path';
  /** 锚点目录名，定位前缀起始位置，默认 'src' */
  anchor?: string;
  /** 跳过 anchor 之后前 N 段，默认 0 */
  skip?: number;
  /** 保留 N 段（含 anchor 之后），0/undefined 表示不限制，默认 0 */
  take?: number;
  /** 是否把文件名（去扩展名）作为最后一段加入，默认 false */
  includeFile?: boolean;
  /**
   * 文件名段的大小写转换。
   *
   * - 'as-is'：原样保留
   * - 'camel'（默认）：'Map2D' → 'map2d'、'user-list' → 'userList'
   * - 'kebab'：'UserList' → 'user-list'
   * - 'snake'：'UserList' → 'user_list'
   * - 函数：完全自定义
   */
  fileNameCase?: 'as-is' | 'camel' | 'kebab' | 'snake' | ((name: string) => string);
  /**
   * 是否保留段中的连字符。默认 true（kebab 目录名如 'flipped-course' 原样保留）。
   * 设为 false 时连字符会被抹掉（'flipped-course' → 'flippedcourse'）。
   */
  preserveHyphens?: boolean;
  /**
   * `index.*` 文件的处理策略（仅当 `includeFile=true` 时生效）。
   *
   * - 'collapse-to-parent'（默认）：跳过 index 文件名，让父目录作为末段。
   *   例：`components/TagInput/index.vue` + includeFile=true → `['components', 'TagInput']`
   * - 'as-is'：保留 index 作为文件名段。
   *   例：`components/TagInput/index.vue` + includeFile=true → `['components', 'TagInput', 'index']`
   */
  indexFile?: 'as-is' | 'collapse-to-parent';
  /** 段级 transform：返回 null 则删除该段。在 skip/take 后、文件名加入前执行。 */
  transform?: (segment: string, index: number, ctx: PrefixContext) => string | null;
}

/**
 * 固定前缀策略：所有 key 共享同一前缀，绕过路径派生。
 */
export interface FixedPrefixStrategy {
  strategy: 'fixed';
  /** 固定前缀字符串，如 'common'；可包含 separator 表达多段 */
  value: string;
}

/**
 * 完全自定义策略：用户函数返回前缀段数组。
 */
export interface CustomPrefixStrategy {
  strategy: 'custom';
  /** (filePath, ctx) => string[]，返回前缀段数组（空数组表示无前缀） */
  resolve: (filePath: string, ctx: PrefixContext) => string[];
}

/**
 * 单条 rules-prefix 规则：路径匹配命中后采用其 `use` 子策略。
 *
 * `match` 的相对基准是 `root`（POSIX 风格），与 BucketRule.match 一致。
 * `use` 不允许嵌套 rules，避免无限套娃（loader 会校验）。
 */
export interface PrefixRule {
  /**
   * 按源码路径（相对 root，POSIX）匹配。
   * - string: 单 glob
   * - string[]: 多 glob 任一命中
   * - RegExp: 直接 test
   * - 函数: (filePath) => boolean
   */
  match: string | string[] | RegExp | ((filePath: string) => boolean);
  /** 命中后采用的策略（不可再嵌套 rules） */
  use: PathPrefixStrategy | FixedPrefixStrategy | CustomPrefixStrategy;
}

/**
 * 规则列表策略：按文件路径分派到不同的子策略。
 *
 * 例：pages/components/utils 分别走不同 path 参数：
 *   rules: [
 *     { match: 'pages/**',      use: { strategy:'path', anchor:'src', take:3 } },
 *     { match: 'components/**', use: { strategy:'path', anchor:'src', includeFile:true, indexFile:'collapse-to-parent' } },
 *     { match: 'utils/**',      use: { strategy:'path', anchor:'src', includeFile:true } },
 *   ]
 *
 * 未命中任何 rule 时使用 fallback；未配置 fallback 时返回空段数组（无前缀）。
 */
export interface RulesPrefixStrategy {
  strategy: 'rules';
  /** 规则列表，按顺序匹配（先匹配先归属） */
  rules: PrefixRule[];
  /** 兜底策略，未命中任何 rule 时使用；不配置则返回空段数组 */
  fallback?: PathPrefixStrategy | FixedPrefixStrategy | CustomPrefixStrategy;
}

export type PrefixStrategyConfig =
  | PathPrefixStrategy
  | FixedPrefixStrategy
  | CustomPrefixStrategy
  | RulesPrefixStrategy;

/**
 * 语义部分兜底（LLM 失败 / skip-llm 时使用）。
 */
export interface KeysFallbackConfig {
  /**
   * 是否与内置 BUILTIN_CN_MAPPINGS 合并。
   * - true（默认）：内置 + 用户配置合并，用户优先
   * - false：仅用 mappings 字段
   */
  extend?: boolean;
  /** 中文 → 英文 ID 映射，用于本地兜底生成 */
  mappings?: Record<string, string>;
}

/**
 * 跨目录 / 跨模块复用策略。
 */
export interface KeysReuseConfig {
  /**
   * 是否允许跨目录复用 i18n key。
   *
   * - false（默认）：相同原文只在同目录前缀下复用 key
   * - true：全局复用，相同原文在任意目录都复用同一个 key
   */
  acrossDirectories?: boolean;
  /**
   * 跨模块复用 key 的 namespace 提升策略。
   *
   * 当一段原文已被 ≥ threshold 个不同前缀使用过时，新分配统一归入 namespace。
   * threshold < 2 视为禁用。
   *
   * 注意：仅作用于「本次新分配」，不回迁历史 key。
   */
  promoteToCommon?: {
    threshold: number;
    namespace?: string;
  };
}

/**
 * Keys 配置：i18n key 的派生 + 兜底 + 复用全部聚合于此。
 */
export interface KeysConfig {
  /** 段分隔符，默认 '.'（io.format='nested' 要求此值） */
  separator?: string;
  /** 前缀派生策略 */
  prefix?: PrefixStrategyConfig;
  /** 语义部分兜底 */
  fallback?: KeysFallbackConfig;
  /** 复用策略 */
  reuse?: KeysReuseConfig;
  /**
   * 动态 key 白名单：源码中以这些前缀开头的 t() 字面量将被 doctor 跳过 orphan/missing 判定。
   * 可以是字符串前缀或 RegExp。
   */
  dynamicKeyAllowlist?: (string | RegExp)[];
  /**
   * noTranslate 判定：返回 true 的 key 在 doctor checkUntranslated 中跳过。
   */
  skip?: (key: string, message: string) => boolean;
}

// ============ 5. 文本提取 ============

/**
 * 文本提取扩展点。
 */
export interface ExtractConfig {
  /**
   * 过滤模式列表。任一模式命中（regex.test 为 true）的字符串将不会进入提取。
   *
   * 命名为 filterPatterns 而非 rejectPatterns，以区别于 merge.onLlmRejected 中的「LLM 拒收」。
   *
   * 模式只在工具内置过滤之后才生效，即用于精修，无法绕过工具自身的安全规则。
   */
  filterPatterns?: RegExp[];
}

// ============ 6. 词表 ============

/**
 * 翻译词表配置。
 */
export interface GlossaryConfig {
  /** 词表文件路径，相对 root；未设置时禁用词表功能 */
  file?: string;
  /**
   * 命中策略：
   * - 'always'（默认）：词表译文优先，与已有目标译文不同时覆盖
   * - 'when-empty'：仅在目标语种缺失/为空时采用词表译文
   */
  override?: 'always' | 'when-empty';
  /** 是否对原文做 trim + 空白压缩后再匹配，默认 true */
  normalize?: boolean;
}

// ============ 7. LLM ============

/**
 * LLM API 共享配置（任务级未指定的字段从此继承）。
 *
 * 使用 OpenAI 兼容 API，通过 baseURL 支持 OpenAI/DeepSeek/Azure 等服务。
 */
export interface LLMSharedConfig {
  /** API 密钥 */
  apiKey?: string;
  /** API 地址（非 OpenAI 服务时需要设置） */
  baseURL?: string;
  /** 模型名称，如 "gpt-4o"、"deepseek-chat" */
  model?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 温度参数，控制输出随机性，默认 0.1 */
  temperature?: number;
  /** 透传到 OpenAI SDK 的 defaultHeaders，用于 OpenAI dialect 扩展 */
  headers?: Record<string, string>;
}

/**
 * 单个 LLM 任务（idGeneration / translation）的配置。
 *
 * 任意 LLMSharedConfig 字段都可以在任务级覆盖；未指定时继承 llm.shared。
 */
export interface LLMTaskConfig extends LLMSharedConfig {
  /** 任务最大并发数，默认 5 */
  concurrency?: number;
  /** 批次大小，默认 30 */
  batchSize?: number;
  /** 批次间最小间隔（毫秒），默认 500 */
  throttleMs?: number;
  /** 自定义 Prompt */
  prompt?: {
    /** 自定义 System Prompt（完全覆盖默认值） */
    system?: string;
    /** 自定义 User Prompt 模板 */
    user?: string;
  };
}

/**
 * LLM 总配置。
 */
export interface LLMConfig {
  /** 共享配置，未指定的字段在任务级继承 */
  shared?: LLMSharedConfig;
  /** ID 生成任务 */
  idGeneration?: LLMTaskConfig;
  /** 翻译任务 */
  translation?: LLMTaskConfig;
}

// ============ 8. 分桶 ============

/**
 * 分桶规则（rules 数组的单个元素）。
 *
 * `match` 与 `matchKey` 互斥，loader 会校验。
 *
 * 匹配优先级：
 * 1. rules 数组顺序优先（先匹配先归属）
 * 2. 所有规则未命中 → 落入 BucketsConfig.defaultBucket
 */
export interface BucketRule {
  /** 桶名称，将作为 `<lang>/<name>.json` 的文件名（必须唯一） */
  name: string;
  /**
   * 按源码路径匹配（相对 root 的 POSIX 路径）。
   * - string: 单个 glob
   * - string[]: 多个 glob 任一匹配
   * - RegExp: 直接 test
   * - 函数: (filePath, key, message) => boolean
   */
  match?:
    | string
    | string[]
    | RegExp
    | ((filePath: string, key: string, message: string) => boolean);
  /**
   * 按 key 内容匹配。命中时不再看 match。
   * 用于源码路径无关的逻辑分组。
   */
  matchKey?: (key: string, message: string) => boolean;
}

/**
 * 分桶导出配置（可选）。
 * 不配置时：所有行为等同当前——`<localesDir>/<lang>.json` 单文件。
 * 配置时：分桶到 `<localesDir>/<lang>/<bucket>.json`，未匹配的 key 进入 defaultBucket。
 */
export interface BucketsConfig {
  /** 桶归属规则列表，按顺序匹配 */
  rules: BucketRule[];
  /** 未匹配规则时归入的桶名，默认 'common' */
  defaultBucket?: string;
  /** 是否额外生成 manifest.json，默认 true */
  emitManifest?: boolean;
  /**
   * 输出布局：
   * - 'by-locale' (默认): `<localesDir>/<lang>/<bucket>.json`
   * - 'by-bucket': `<localesDir>/<bucket>/<lang>.json`
   */
  layout?: 'by-locale' | 'by-bucket';
}

// ============ 9. 合并阶段 ============

/**
 * 合并阶段配置。
 */
export interface MergeConfig {
  /**
   * LLM 拒收条目（返回值非空但被 isValidTranslation 判无效，如纯标点 "!"）的处理策略。
   *
   * - 'fallback-to-source'（默认）：用源语言文本作为目标语言值合并
   * - 'warn-only'：仅在 RunReport 警告，不合并；条目永久卡在 untranslated.json 等待人工处理
   */
  onLlmRejected?: 'fallback-to-source' | 'warn-only';
}

// ============ 10. CI ============

/**
 * CI 集成配置。
 */
export interface CIConfig {
  /**
   * generate 完成后若覆盖率低于该百分比（0-100）则以非零状态码退出。
   * CLI --coverage-threshold 优先级更高，未传时回退到此字段。
   */
  coverageThreshold?: number;
}

// ============ 完整配置 ============

/**
 * i18n-tools 完整配置接口。
 */
export interface I18nToolsConfig {
  /** 项目根目录（绝对路径） */
  root: string;

  /** 框架配置 */
  framework: FrameworkConfig;

  /** 语言配置 */
  locales?: LocalesConfig;

  /** IO 配置 */
  io?: IoConfig;

  /** Keys 配置 */
  keys?: KeysConfig;

  /** 文本提取扩展 */
  extract?: ExtractConfig;

  /** 词表配置 */
  glossary?: GlossaryConfig;

  /**
   * LLM 配置。
   *
   * 未配置时仍可运行不依赖 LLM 的命令（restore / pick / merge / export / doctor 等），
   * 但 idGeneration / translation 等真正调用 LLM 的命令会在执行时报错并提示需配置 apiKey。
   */
  llm?: LLMConfig;

  /** 分桶配置（可选） */
  buckets?: BucketsConfig;

  /** 合并阶段配置 */
  merge?: MergeConfig;

  /** CI 集成配置 */
  ci?: CIConfig;
}

// ============ 已解析配置 ============

/**
 * 已解析的 LLM 任务配置（apiKey 等字段已经从 shared 继承并填充）。
 */
export type ResolvedLLMTaskConfig = Required<
  Omit<LLMTaskConfig, 'baseURL' | 'headers' | 'prompt'>
> &
  Pick<LLMTaskConfig, 'baseURL' | 'headers'> & {
    prompt: { system?: string; user?: string };
  };

/**
 * 已解析的 path 策略：所有可选字段已填默认值（transform 保留可选语义）。
 */
export type ResolvedPathPrefixStrategy = Required<Omit<PathPrefixStrategy, 'transform'>> & {
  transform?: PathPrefixStrategy['transform'];
};

/**
 * 已解析的非嵌套子策略：rules.use / rules.fallback 的解析结果（不含 rules 自身）。
 */
export type ResolvedNestedPrefixStrategy =
  | ResolvedPathPrefixStrategy
  | FixedPrefixStrategy
  | CustomPrefixStrategy;

/**
 * 已解析的 rules 策略：rules.use / fallback 均已展开默认值。
 */
export interface ResolvedRulesPrefixStrategy {
  strategy: 'rules';
  rules: Array<{
    match: PrefixRule['match'];
    use: ResolvedNestedPrefixStrategy;
  }>;
  /** 未配置 fallback 时此字段为 undefined，IdGenerator 视为「返回空段数组」 */
  fallback?: ResolvedNestedPrefixStrategy;
}

/**
 * 已解析的前缀策略。各 strategy 的可选字段已填充默认值。
 */
export type ResolvedPrefixStrategy = ResolvedNestedPrefixStrategy | ResolvedRulesPrefixStrategy;

/**
 * 已解析的配置（所有路径为绝对路径，可选项已填默认值）。
 */
export interface ResolvedConfig {
  root: string;

  framework: {
    type: string;
    library: string;
    namespace: string;
    tImport: string;
    includeDefaultMessage: boolean;
  };

  locales: {
    source: string;
    targets: string[];
    names: Record<string, string>;
  };

  io: {
    sourceDir: string;
    localesDir: string;
    /** 仅当用户显式配置 exportDir 时才存在；未配置时禁用 export 命令 */
    exportDir?: string;
    /** 仅当用户显式配置 customDir 时才存在；未配置则保持 undefined */
    customDir?: string;
    include: string[];
    exclude: string[];
    format: 'flat' | 'nested';
    indent: number;
    prettify: boolean;
  };

  keys: {
    separator: string;
    prefix: ResolvedPrefixStrategy;
    fallback: {
      extend: boolean;
      mappings: Record<string, string>;
    };
    reuse: {
      acrossDirectories: boolean;
      promoteToCommon: {
        threshold: number;
        namespace: string;
      };
    };
    dynamicKeyAllowlist: (string | RegExp)[];
    skip?: (key: string, message: string) => boolean;
  };

  extract: {
    filterPatterns: RegExp[];
  };

  glossary: {
    /** 仅当用户显式配置 file 时才存在；未配置则保持 undefined */
    file?: string;
    override: 'always' | 'when-empty';
    normalize: boolean;
  };

  llm: {
    idGeneration: ResolvedLLMTaskConfig;
    translation: ResolvedLLMTaskConfig;
  };

  /** 已解析的分桶配置；未配置时为 undefined */
  buckets?: {
    rules: BucketRule[];
    defaultBucket: string;
    emitManifest: boolean;
    layout: 'by-locale' | 'by-bucket';
  };

  merge: {
    onLlmRejected: 'fallback-to-source' | 'warn-only';
  };

  ci: {
    coverageThreshold?: number;
  };
}

/**
 * 辅助函数：定义配置（提供类型提示）
 */
export function defineConfig(config: I18nToolsConfig): I18nToolsConfig {
  return config;
}
