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

// 工具函数（包括缓存管理、日志等）
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
  // 日志系统
  Logger,
  ContextLogger,
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
