/**
 * 项目通用常量定义
 * 这些常量与具体组件库无关，是 MCP Server 项目的通用配置
 */

/** 图标 SVG 源码映射文件（相对数据目录） */
export const ICONS_SVG_FILE = 'icons-svg.json';

// 提取并发
export const DEFAULT_MAX_CONCURRENT_EXTRACTION = 5;

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

// MCP 工具名称
export const MCP_TOOLS = {
  // 组件库工具
  LIST_COMPONENTS: 'list-components',
  GET_COMPONENT_INFO: 'get-component-info',
  GET_COMPONENT_PROPS: 'get-component-props',
  GET_COMPONENT_EXAMPLES: 'get-component-examples',
  SEARCH_COMPONENTS: 'search-components',
  SEARCH_ICONS: 'search-icons',
  GET_ICON_SVG: 'get-icon-svg',
  GET_COMPONENT_DEPENDENCIES: 'get-component-dependencies',
  GET_COMPONENT_CHANGELOG: 'get-component-changelog',
  GET_CATEGORIES_AND_TAGS: 'get-categories-and-tags',
  // 工具包工具
  LIST_PACKAGES: 'list-packages',
  GET_PACKAGE_INFO: 'get-package-info',
  SEARCH_PACKAGES: 'search-packages',
} as const;

// 资源类型
export const RESOURCE_TYPES = {
  COMPONENT_SOURCE: 'component-source',
  COMPONENT_README: 'component-readme',
  COMPONENT_STORY: 'component-story',
  COMPONENT_CHANGELOG: 'component-changelog',
} as const;
