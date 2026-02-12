/**
 * 项目通用常量定义
 * 这些常量与具体组件库无关，是 MCP Server 项目的通用配置
 */

// 大小常量
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = 1024 * 1024;

// 目录和文件名
export const DEFAULT_DATA_DIR = 'data';
export const DEFAULT_CACHE_DIR = '.cache';

// 缓存和性能相关
export const DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时
export const DEFAULT_MAX_CACHE_SIZE = 100 * BYTES_PER_MB; // 100MB
export const DEFAULT_MAX_CONCURRENT_EXTRACTION = 5;
export const DEFAULT_EXTRACTION_TIMEOUT = 30000; // 30秒

// WebSocket相关
export const DEFAULT_WS_PORT = 8080;
export const DEFAULT_WS_HOST = 'localhost';
export const DEFAULT_WS_PATH = '/mcp';
export const DEFAULT_WS_MAX_CONNECTIONS = 100;
export const DEFAULT_WS_HEARTBEAT_INTERVAL = 30000; // 30秒
export const DEFAULT_WS_CLIENT_TIMEOUT = 60000; // 60秒

// 文件扩展名
export const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx'] as const;
export const JAVASCRIPT_EXTENSIONS = ['.js', '.jsx'] as const;
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;
export const JSON_EXTENSIONS = ['.json'] as const;

// MIME 类型映射
export const MIME_TYPES = {
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.css': 'text/css',
  '.html': 'text/html',
  '.txt': 'text/plain',
} as const;

// 默认忽略模式
export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '**/*.test.{ts,tsx,js,jsx}',
  '**/*.spec.{ts,tsx,js,jsx}',
  '**/__tests__/**',
  '**/.git/**',
  '**/.DS_Store',
] as const;

// MCP 工具名称
export const MCP_TOOLS = {
  LIST_COMPONENTS: 'list-components',
  GET_COMPONENT_INFO: 'get-component-info',
  GET_COMPONENT_PROPS: 'get-component-props',
  GET_COMPONENT_EXAMPLES: 'get-component-examples',
  SEARCH_COMPONENTS: 'search-components',
  SEARCH_ICONS: 'search-icons',
  GET_COMPONENT_DEPENDENCIES: 'get-component-dependencies',
  GET_COMPONENT_CHANGELOG: 'get-component-changelog',
  GET_CATEGORIES_AND_TAGS: 'get-categories-and-tags',
} as const;

// 资源类型
export const RESOURCE_TYPES = {
  COMPONENT_SOURCE: 'component-source',
  COMPONENT_README: 'component-readme',
  COMPONENT_STORY: 'component-story',
  COMPONENT_CHANGELOG: 'component-changelog',
} as const;
