/**
 * 组件库 MCP Server
 *
 * 这是一个专门为 AIX 组件库设计的 Model Context Protocol (MCP) 服务器，
 * 提供组件查询、文档获取、示例代码等功能，帮助 LLM 更好地理解和使用组件库。
 */

// 核心服务器
export { McpServer, createServer } from './server/index';

// 类型定义
export type {
  ComponentInfo,
  PropDefinition,
  ComponentExample,
  ChangelogEntry,
  PackageInfo,
  ExtractorConfig,
  ComponentIndex,
  SearchResult,
  ToolArguments,
  CacheItem,
  ParseOptions,
} from './types/index';

// 提取器
export { ComponentExtractor, ReadmeExtractor } from './extractors/index';

// 解析器
export { createParsers } from './parsers/index';

// MCP 工具
export { createTools } from './mcp-tools/index';

// 工具函数（包括缓存管理、错误处理、日志等）
export {
  readPackageJson,
  findPackages,
  findComponentFiles,
  getFileNameWithoutExt,
  isComponentFile,
  capitalize,
  getDisplayName,
  safeJsonParse,
  deepMerge,
  cleanDocString,
  extractTags,
  // 缓存管理
  CacheManager,
  createCacheManager,
  // 错误处理
  MCPError,
  ComponentNotFoundError,
  ToolNotFoundError,
  ExtractionError,
  ParseError,
  CacheError,
  ValidationError,
  ConfigError,
  TimeoutError,
  ErrorHandler,
  assert,
  assertNotNull,
  // 日志系统
  Logger,
  ContextLogger,
  PerformanceMonitor,
  createLogger,
  logger,
  cliLogger,
  log,
  LogLevel,
} from './utils/index';

// 系统提示词
export { getAllPrompts, getPrompt } from './prompts/index';

// CLI 工具
export { McpCli } from './cli';

// 常量
import { DEFAULT_CACHE_TTL } from './constants';

/**
 * 版本信息
 */
export const VERSION = '1.0.0';

/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  packagesDir: './packages',
  outputDir: './data',
  cacheDir: './data/.cache',
  cacheTTL: DEFAULT_CACHE_TTL,
  ignorePackages: [] as string[],
  enableCache: true,
  verbose: false,
};
