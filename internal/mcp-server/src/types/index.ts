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
 */
export interface ComponentPaths {
  /** 源码路径 */
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
export interface ComponentInfo
  extends ComponentBasicInfo, ComponentPaths, ComponentDependencies {
  /** Props 定义 */
  props: PropDefinition[];
  /** 组件示例 */
  examples: ComponentExample[];
  /** 变更日志 */
  changelog?: ChangelogEntry[];
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
  /** 缓存启用 */
  enableCache?: boolean;
  /** 详细输出 */
  verbose?: boolean;
  /** 最大并发提取数 */
  maxConcurrentExtraction?: number;
  /** 提取超时时间 */
  extractionTimeout?: number;
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
  keywords: string[];
  dataFile: string;
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
