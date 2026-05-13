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
  /**
   * 翻译词表（glossary / translation memory）文件路径，相对于 rootDir。
   * 命中词表的原文将直接采用其译文，不送 LLM。未配置则禁用此特性。
   */
  glossary?: string;
}

/**
 * 翻译词表配置
 */
export interface GlossaryConfig {
  /**
   * 命中策略：
   * - 'always'（默认）：词表译文优先；与已有目标译文不同时覆盖并打 INFO 审计
   * - 'when-empty'：仅在目标语种缺失/为空时采用词表译文
   */
  override?: 'always' | 'when-empty';
  /** 是否对原文做 trim + 空白压缩后再匹配，默认 true */
  normalize?: boolean;
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
  /**
   * 是否允许跨目录复用 i18n key，默认 false。
   *
   * - false：相同原文只在同一目录前缀下复用 key（推荐，保持 namespace 边界清晰）
   * - true：全局复用，相同原文在任意目录都复用同一个 key（最大去重，但跨包引用）
   */
  reuseAcrossDirectories?: boolean;
  /**
   * 路径前缀保留的最大目录层级数，默认 0（不限制，保留 anchor 之后到文件目录的全部段）。
   *
   * 对 `src/pages/flipped-course/components/Map2D.vue`（anchor='src'）的输出：
   * - 0（默认）：`pages.flipped-course.components`
   * - 1：`pages`
   * - 2：`pages.flipped-course`
   * - 3：`pages.flipped-course.components`
   * - ≥ 4：仍是 `pages.flipped-course.components`（实际层级不足时不补）
   *
   * 注意：设置了 `value` 固定前缀时本字段不生效。
   */
  maxDepth?: number;

  /**
   * 跨模块复用 key 的 namespace 提升策略（可选）。
   *
   * 当一段原文已在不同目录前缀下被分配过 ≥ `threshold` 个不同 key 时，本次
   * 新分配将统一归入 `namespace`（如 `common`），避免相同语义在多个模块下
   * 散落各自的 key、且首次出现位置决定 namespace 的痕迹长期残留。
   *
   * - `threshold`：触发阈值（必填；显式配置即启用，最小有效值为 2）
   * - `namespace`：固定命名空间，默认 `'common'`
   *
   * 注意：本机制仅影响"本次新分配"的 ID 选择，**不回迁历史 key**——已写入
   * locale 的旧 key 仍按原前缀保留。要彻底统一旧数据，需 RESTORE → 删 key →
   * 重跑 GENERATE。设计上选择保守不回迁，避免误改用户已 review 通过的 key。
   *
   * 与 `value` 固定前缀同用时本字段不生效（同 maxDepth 行为）。
   */
  promoteToCommon?: {
    threshold: number;
    namespace?: string;
  };
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
  /**
   * 是否在生成的 i18n 调用中携带 defaultMessage（react-intl 等需要源文本兜底时使用）。
   * 默认 false。
   */
  includeDefaultMessage?: boolean;
}

/**
 * 模块归属规则（rules 数组的单个元素）。
 * `match` 与 `matchKey` 互斥，loader 会校验。
 *
 * 匹配优先级：
 * 1. rules 数组顺序优先（先匹配先归属）
 * 2. 所有规则未命中 → 落入 ModulesConfig.defaultModule（默认 'common'）
 */
export interface ModuleRule {
  /** 模块名称，将作为 `<lang>/<name>.json` 的文件名（必须唯一） */
  name: string;
  /**
   * 按源码路径匹配（相对 rootDir 的 POSIX 路径）。
   * - string: 单个 glob，如 `'src/views/order/**'`
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
   * 用于源码路径无关的逻辑分组（如 'error.*' 归 error 模块）。
   */
  matchKey?: (key: string, message: string) => boolean;
}

/**
 * 模块化导出配置（可选）。
 * 不配置时：所有行为等同当前——`locale/<lang>.json` 单文件。
 * 配置时：分桶到 `locale/<lang>/<module>.json`，未匹配的 key 进入 defaultModule。
 */
export interface ModulesConfig {
  /** 模块归属规则列表，按顺序匹配 */
  rules: ModuleRule[];
  /** 未匹配规则时归入的模块名，默认 'common' */
  defaultModule?: string;
  /** 是否额外生成 manifest.json，默认 true */
  manifest?: boolean;
  /**
   * 输出布局：
   * - 'by-locale' (默认): `locale/<lang>/<module>.json`
   * - 'by-module': `locale/<module>/<lang>.json`
   */
  layout?: 'by-locale' | 'by-module';
}

/**
 * 文本提取配置
 *
 * 工具默认对 template 中所有含中文或字母的文本节点视为可见文案进行提取。
 * 业务侧若有 dev 占位、内部标识、域名常量等不希望被翻译的文本，可通过
 * rejectPatterns 声明黑名单。工具内部不做任何业务判断，只提供扩展点。
 */
export interface ExtractionConfig {
  /**
   * 拒收模式列表。任一模式命中（regex.test 为 true）的字符串将不会进入提取。
   * 模式只在"待提取候选"已通过工具内置过滤（已含中文 / 已通过技术值排除）后才生效，
   * 即用于精修，无法用于绕过工具自身的安全规则。
   */
  rejectPatterns?: RegExp[];
}

/**
 * 合并阶段配置
 */
export interface MergeConfig {
  /**
   * LLM 拒收条目（返回值非空但被 isValidTranslation 判无效，如纯标点 "!"）的处理策略。
   *
   * - 'fallback-to-source'（默认）：用源语言文本作为目标语言值合并到 translations.json
   *   与目标语言文件，并从 untranslated.json 移除。运行时不会再出现 "找不到 key 显示
   *   key 字符串" 的兜底问题；副作用是英文模式下显示源语言片段（如 "吧！"），但比显示
   *   key 字符串友好。适用于"片段化提取语气词"等无法独立翻译的场景。
   * - 'warn-only'：仅在 RunReport 警告，不合并；条目永久卡在 untranslated.json 等待
   *   人工处理（修源码合并片段或手改 untranslated.json）。语义最严格，但需手工介入。
   *
   * 与"真未翻译条目"（enValue 为空）的处理无关——后者始终保留在 untranslated.json，
   * 不会被本策略影响，避免静默把"待翻译"伪装成"已完成"。
   */
  rejectedStrategy?: 'fallback-to-source' | 'warn-only';
}

/**
 * 持久化格式配置
 */
export interface OutputConfig {
  /**
   * 语言文件序列化格式，同时作用于 paths.locale（工作 + 运行时目录）
   * 和 paths.exportLocale（独立导出目录）。
   *
   * - 'flat'（默认）：扁平 key/value，如 `{ "views__order__submit": "提交" }`
   * - 'nested'：按 idPrefix.separator 拆分 key 生成树形结构。
   *   要求 idPrefix.separator === '.'；扁平 key 集合不得存在前缀关系
   *   （即不能同时有 `a.b` 和 `a.b.c` 作为叶子），否则写入时抛错。
   *
   * 工具内部读写时一律以扁平 LocaleMap 工作；嵌套仅作用于落盘那一步。
   */
  format?: 'flat' | 'nested';
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
    /**
     * 默认配置，idGeneration 和 translation 中未指定的字段会继承此配置。
     * 使用同一个 API Key / 模型时，只需在此配置，无需在两处重复。
     */
    default?: Partial<LLMConfig>;
    /** ID 生成接口，未指定的字段继承自 llm.default */
    idGeneration?: Partial<LLMConfig>;
    /** 翻译接口，未指定的字段继承自 llm.default */
    translation?: Partial<LLMConfig>;
  };

  /** 自定义 AI 提示词 */
  prompts?: PromptsConfig;

  /** 翻译词表配置（仅当配置了 paths.glossary 时生效） */
  glossary?: GlossaryConfig;

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

  /**
   * 文本提取扩展点。业务侧可声明 rejectPatterns 拒收特定文本。
   */
  extraction?: ExtractionConfig;

  /**
   * 模块化导出配置（可选）。未配置时所有 key 输出到单个文件。
   * 配置时按 rules 分桶到子目录，详见 ModulesConfig。
   */
  modules?: ModulesConfig;

  /**
   * 持久化格式配置（可选）。控制 paths.locale 与 paths.exportLocale 的落盘格式；
   * 工具内部仍以扁平 LocaleMap 工作。
   */
  output?: OutputConfig;

  /**
   * 合并阶段配置（可选）。控制 LLM 拒收条目（如纯标点）的兜底策略，详见 MergeConfig。
   */
  merge?: MergeConfig;
}

/**
 * 已解析的配置（所有路径为绝对路径，可选项已填默认值）
 */
export interface ResolvedConfig {
  rootDir: string;
  framework: 'vue' | 'react';
  /**
   * Vue 框架配置。loader 始终用默认值填充，与 framework 无关；
   * 仅当 `framework === 'vue'` 时被适配器消费。
   */
  vue: Required<VueConfig>;
  /**
   * React 框架配置。loader 始终用默认值填充，与 framework 无关；
   * 仅当 `framework === 'react'` 时被适配器消费。
   */
  react: Required<ReactConfig>;
  locale: Required<LocaleConfig>;
  paths: {
    locale: string;
    /** 仅当用户显式配置 customLocale 时才存在；未配置则保持 undefined，下游据此判定单/双目录 */
    customLocale?: string;
    /** 仅当用户显式配置 exportLocale 时才存在；未配置时禁用 export 命令 */
    exportLocale?: string;
    source: string;
    tImport: string;
    /** 仅当用户显式配置 glossary 时才存在；未配置则保持 undefined */
    glossary?: string;
  };
  llm: {
    idGeneration: Required<Omit<LLMConfig, 'baseURL'>> & Pick<LLMConfig, 'baseURL'>;
    translation: Required<Omit<LLMConfig, 'baseURL'>> & Pick<LLMConfig, 'baseURL'>;
  };
  prompts: {
    idGeneration: { system?: string; user?: string };
    translation: { system?: string; user?: string };
  };
  idPrefix: Required<IdPrefixConfig>;
  glossary: Required<GlossaryConfig>;
  concurrency: Required<ConcurrencyConfig>;
  batchSize: number;
  batchDelay: number;
  format: boolean;
  include: string[];
  exclude: string[];
  /** 已解析的提取扩展配置（rejectPatterns 默认 []） */
  extraction: {
    rejectPatterns: RegExp[];
  };
  /** 已解析的模块化配置；未配置时为 undefined */
  modules?: {
    rules: ModuleRule[];
    defaultModule: string;
    manifest: boolean;
    layout: 'by-locale' | 'by-module';
  };

  /** 已解析的导出格式配置 */
  output: {
    format: 'flat' | 'nested';
  };

  /** 已解析的合并阶段配置 */
  merge: {
    rejectedStrategy: 'fallback-to-source' | 'warn-only';
  };
}

/**
 * 辅助函数：定义配置（提供类型提示）
 */
export function defineConfig(config: I18nToolsConfig): I18nToolsConfig {
  return config;
}
