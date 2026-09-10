// ==================== 核心数据类型 ====================

/**
 * 组件基本信息
 */
export interface ComponentBasicInfo {
  /** 组件名称 */
  name: string;
  /** 包名 */
  packageName: string;
  /** 版本号 */
  version: string;
  /** 描述 */
  description: string;
  /** 分类 */
  category: string;
  /** 标签 */
  tags: string[];
  /** 作者 */
  author: string;
  /** 许可证 */
  license: string;
}

/**
 * 组件文件路径信息
 *
 * 全部为相对 workspace 根的路径（如 `packages/button`），
 * 使用前需用 findRepoRoot() 定位仓库再拼成绝对路径。
 */
export interface ComponentPaths {
  /** 源码路径（包根目录） */
  sourcePath: string;
  /** Stories 路径 */
  storiesPath?: string;
  /** README 路径 */
  readmePath?: string;
}

/**
 * 组件依赖信息
 */
export interface ComponentDependencies {
  /** 依赖列表 */
  dependencies: string[];
  /** 对等依赖列表 */
  peerDependencies: string[];
}

/**
 * 完整的组件信息
 */
export interface ComponentInfo extends ComponentBasicInfo, ComponentPaths, ComponentDependencies {
  /** Props 定义 */
  props: PropDefinition[];
  /**
   * Emits 定义
   *
   * 可选：索引是从磁盘 JSON 反序列化来的，早于本字段生成的数据没有它。
   */
  emits?: EmitDefinition[];
  /** Slots 定义，可选原因同 emits */
  slots?: SlotDefinition[];
  /**
   * 同一个包内导出的子组件名
   *
   * 像 @aix/popper 一个包里就有 Popper / Tooltip / Popover / Dropdown 四个组件，
   * 从 README 各章节的属性表标题识别得到。它们的 props/emits/slots 通过各自的
   * `group` 字段区分，不单独拆成顶层组件——章节标题并不总是组件名
   * （`createLocale`、`音频来源契约` 这类拆出去只会产生垃圾条目）。
   */
  subComponents?: string[];
  /** 组件示例 */
  examples: ComponentExample[];
  /** 变更日志 */
  changelog?: ChangelogEntry[];

  /**
   * README 正文快照（已剥离 frontmatter）
   *
   * 仅在提取阶段短暂存在，DataManager 落盘时会剥离到 docs-index.json，
   * 不会进入 components-index.json，避免撑大主索引和 get-component-info 的返回值。
   */
  readmeContent?: string;
  /** CHANGELOG 正文快照，去向同 readmeContent */
  changelogContent?: string;
}

/**
 * 文档快照索引
 *
 * 发布到 npm 的包里没有 packages/ 源码，靠这份快照让文档类工具和资源
 * 在使用方机器上依然可用。
 */
export interface DocsIndex {
  /** 最后更新时间 */
  lastUpdated: string;
  /** 包名 -> 文档正文 */
  docs: Record<string, { readme?: string; changelog?: string }>;
}

/**
 * Props 定义接口
 */
export interface PropDefinition {
  /** 属性名 */
  name: string;
  /** 类型 */
  type: string;
  /** 是否必需 */
  required: boolean;
  /** 默认值 */
  defaultValue?: string;
  /** 描述 */
  description?: string;
  /** 可选值枚举 */
  enum?: string[];
  /**
   * 所属章节
   *
   * 一个包的 README 里常有多个子组件各自的属性表，靠它区分这条 prop 属于谁。
   */
  group?: string;
}

/**
 * Emits 定义接口
 */
export interface EmitDefinition {
  /** 事件名 */
  name: string;
  /** 回调参数 */
  params?: string;
  /** 描述 */
  description?: string;
  /** 所属章节，含义同 PropDefinition.group */
  group?: string;
}

/**
 * Slots 定义接口
 */
export interface SlotDefinition {
  /** 插槽名 */
  name: string;
  /** 描述 */
  description?: string;
  /** 作用域参数 */
  scope?: string;
  /** 所属章节，含义同 PropDefinition.group */
  group?: string;
}

/**
 * 组件示例接口
 */
export interface ComponentExample {
  /** 标题 */
  title: string;
  /** 描述 */
  description: string;
  /** 代码 */
  code: string;
  /** 语言 */
  language: 'tsx' | 'jsx' | 'ts' | 'js' | 'vue';
  /** 标签 */
  tags?: string[];
}

/**
 * 变更日志条目接口
 */
export interface ChangelogEntry {
  /** 版本 */
  version: string;
  /** 日期 */
  date: string;
  /** 变更类型 */
  type: 'major' | 'minor' | 'patch';
  /** 变更内容 */
  changes: string[];
}

/**
 * 包信息接口
 */
export interface PackageInfo {
  /** 包名 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description?: string;
  /** 作者 (字符串或对象格式) */
  author?: string | { name: string; email?: string; url?: string };
  /** 许可证 */
  license?: string;
  /** 依赖 */
  dependencies?: Record<string, string>;
  /** 对等依赖 */
  peerDependencies?: Record<string, string>;
  /** 开发依赖 */
  devDependencies?: Record<string, string>;
}

// ==================== 配置类型 ====================

/**
 * 提取器配置接口
 */
export interface ExtractorConfig {
  /** 包目录 */
  packagesDir: string;
  /** 输出目录 */
  outputDir: string;
  /** 忽略的包 */
  ignorePackages?: string[];
  /** 详细输出 */
  verbose?: boolean;
  /** 最大并发提取数 */
  maxConcurrentExtraction?: number;
}

// ==================== 索引和搜索类型 ====================

/**
 * 组件索引接口
 */
export interface ComponentIndex {
  /** 组件列表 */
  components: ComponentInfo[];
  /** 分类 */
  categories: string[];
  /** 标签 */
  tags: string[];
  /** 最后更新时间 */
  lastUpdated: string;
  /** 版本 */
  version: string;
}

/**
 * 图标索引项接口（索引中的简化图标信息）
 */
export interface IconIndexItem {
  name: string;
  packageName: string;
  description: string;
  category: string;
  iconCategory: string;
  tags: string[];
  /** 检索关键词，含中文别名 */
  keywords: string[];
}

/**
 * 图标搜索结果
 *
 * 图标不是组件，早先复用 SearchResult 伪造了一个 ComponentInfo
 * （props 空数组、version 写死 1.0.0、sourcePath 空串），
 * 这些假字段会被 LLM 当真，所以给图标单独一套结构。
 */
export interface IconSearchResult {
  /** 图标组件名 */
  name: string;
  /** 所属包名 */
  packageName: string;
  /** 图标分类 */
  category: string;
  /** 描述 */
  description: string;
  /** 可直接使用的导入语句 */
  importStatement: string;
  /** 匹配分数 */
  score: number;
  /** 匹配的字段 */
  matchedFields: string[];
}

/**
 * 图标索引接口
 */
export interface IconsIndex {
  /** 图标总数 */
  totalIcons: number;
  /** 分类统计 */
  categories: Record<string, number>;
  /** 最后更新时间 */
  lastUpdated: string;
  /** 图标列表 */
  icons: IconIndexItem[];
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
  /** 组件信息 */
  component: ComponentInfo;
  /** 匹配分数 */
  score: number;
  /** 匹配的字段 */
  matchedFields: string[];
}

/**
 * 组件摘要
 *
 * 列表/搜索场景专用。完整的 ComponentInfo 携带 props 和 examples，
 * 单次 list-components 会产生上百 KB 的 JSON，直接撑爆 LLM 上下文，
 * 因此列表类工具只返回摘要，详情由 get-component-info 按需获取。
 */
export interface ComponentSummary extends ComponentBasicInfo {
  /** 同包内的子组件名，仅在存在多个时给出 */
  subComponents?: string[];
  /** Props 数量 */
  propsCount: number;
  /** Emits 数量 */
  emitsCount: number;
  /** Slots 数量 */
  slotsCount: number;
  /** 示例数量 */
  examplesCount: number;
}

/**
 * 摘要形式的搜索结果
 */
export interface SearchResultSummary {
  /** 组件摘要 */
  component: ComponentSummary;
  /** 匹配分数 */
  score: number;
  /** 匹配的字段 */
  matchedFields: string[];
}

/**
 * 把完整组件信息压成摘要
 */
export function toComponentSummary(component: ComponentInfo): ComponentSummary {
  return {
    name: component.name,
    packageName: component.packageName,
    version: component.version,
    description: component.description,
    category: component.category,
    tags: component.tags,
    author: component.author,
    license: component.license,
    subComponents: component.subComponents,
    propsCount: component.props?.length ?? 0,
    emitsCount: component.emits?.length ?? 0,
    slotsCount: component.slots?.length ?? 0,
    examplesCount: component.examples?.length ?? 0,
  };
}

// ==================== MCP 协议类型 ====================

/**
 * MCP 工具参数接口
 */
export interface ToolArguments {
  [key: string]: unknown;
}

// ==================== 工具类型 ====================

/**
 * 缓存项接口
 */
export interface CacheItem<T = unknown> {
  /** 数据 */
  data: T;
  /** 时间戳 */
  timestamp: number;
  /** 过期时间 (毫秒) */
  ttl: number;
}

/**
 * 解析选项接口
 */
export interface ParseOptions {
  /** 是否解析 JSDoc */
  parseJSDoc?: boolean;
  /** 是否解析示例 */
  parseExamples?: boolean;
  /** 是否解析依赖 */
  parseDependencies?: boolean;
}

// 工具包类型
export * from './tool-package';
