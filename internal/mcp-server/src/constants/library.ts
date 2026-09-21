/**
 * 组件库标识常量
 *
 * 本服务专为 AIX 组件库设计，此处集中存放组件库的身份信息，
 * 供 CLI 提示、MCP serverInfo 和工具描述引用。
 */

import { readSelfVersion } from '../utils/repo-root';

export const COMPONENT_LIBRARY_CONFIG = {
  // 组件库名称
  displayName: 'AIX 组件库',

  // 包相关
  packageScope: '@aix', // npm scope
  packagePrefix: 'aix', // 提示词名称前缀

  // 服务器标识
  serverName: 'AIX Components MCP Server',
  packageName: 'aix-components-mcp',

  // CLI 工具
  cliName: 'aix-mcp-server',
  cliDisplayName: 'AIX 组件库 MCP Server 命令行工具',

  // 版本信息（读自 package.json，避免与实际发布版本脱节）
  version: readSelfVersion(),
} as const;

// 从配置中导出常用常量
export const PACKAGE_NAME = COMPONENT_LIBRARY_CONFIG.packageName;
export const SERVER_NAME = COMPONENT_LIBRARY_CONFIG.serverName;
export const SERVER_VERSION = COMPONENT_LIBRARY_CONFIG.version;
