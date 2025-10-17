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
export const COMPONENTS_INDEX_FILE = 'components-index.json';
export const METADATA_FILE = 'metadata.json';
export const CACHE_INDEX_FILE = 'cache-index.json';

// 文件模式和权限
export const DEFAULT_FILE_MODE = 0o644;
export const DEFAULT_DIR_MODE = 0o755;

// 缓存和性能相关
export const DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时
export const DEFAULT_MAX_CACHE_SIZE = 100 * BYTES_PER_MB; // 100MB
export const DEFAULT_MAX_CONCURRENT_EXTRACTION = 5;
export const DEFAULT_EXTRACTION_TIMEOUT = 30000; // 30秒
export const DEFAULT_LARGE_FILE_THRESHOLD = 10 * BYTES_PER_MB; // 10MB

// WebSocket相关
export const DEFAULT_WS_PORT = 8080;
export const DEFAULT_WS_HOST = 'localhost';
export const DEFAULT_WS_PATH = '/mcp';
export const DEFAULT_WS_MAX_CONNECTIONS = 100;
export const DEFAULT_WS_HEARTBEAT_INTERVAL = 30000; // 30秒
export const DEFAULT_WS_CLIENT_TIMEOUT = 60000; // 60秒

// 安全相关
export const DEFAULT_RATE_LIMIT_WINDOW = 60 * 1000; // 1分钟
export const DEFAULT_GLOBAL_RATE_LIMIT = 600; // 每分钟600请求
export const DEFAULT_CLIENT_RATE_LIMIT = 60; // 每客户端每分钟60请求
export const DEFAULT_MAX_REQUEST_SIZE = 5 * BYTES_PER_MB; // 5MB

// 监控相关
export const DEFAULT_MONITORING_INTERVAL = 5000; // 5秒
export const MAX_RECENT_ERRORS = 100; // 最多保留100个最近错误

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

// MCP 提示名称
export const MCP_PROMPTS = {
  COMPONENT_USAGE: 'component-usage',
  EXPERT_PROMPT: 'expert-prompt',
} as const;

// 资源类型
export const RESOURCE_TYPES = {
  COMPONENT_SOURCE: 'component-source',
  COMPONENT_README: 'component-readme',
  COMPONENT_STORY: 'component-story',
  COMPONENT_CHANGELOG: 'component-changelog',
} as const;

// 日志级别
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

// 环境变量名称
export const ENV_VARS = {
  NODE_ENV: 'NODE_ENV',
  MCP_DATA_DIR: 'MCP_DATA_DIR',
  MCP_CACHE_DIR: 'MCP_CACHE_DIR',
  MCP_PACKAGES_DIR: 'MCP_PACKAGES_DIR',
  MCP_ENABLE_API_KEY_AUTH: 'MCP_ENABLE_API_KEY_AUTH',
  MCP_API_KEYS: 'MCP_API_KEYS',
  MCP_RATE_LIMIT_ENABLED: 'MCP_RATE_LIMIT_ENABLED',
  MCP_GLOBAL_RATE_LIMIT: 'MCP_GLOBAL_RATE_LIMIT',
  MCP_CLIENT_RATE_LIMIT: 'MCP_CLIENT_RATE_LIMIT',
  MCP_MAX_REQUEST_SIZE: 'MCP_MAX_REQUEST_SIZE',
} as const;

// 退出代码
export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARGS: 2,
  CONFIG_ERROR: 3,
  NETWORK_ERROR: 4,
} as const;
