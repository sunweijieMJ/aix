/**
 * 组件库适配常量定义
 * 这些常量是组件库特定的配置，适配其他组件库时主要修改此文件
 */

// ========================================
// 组件库配置 - 适配其他组件库时需要修改此部分
// ========================================

/**
 * 组件库基础信息配置
 * 其他组件库使用时，主要修改此配置对象
 */
export const COMPONENT_LIBRARY_CONFIG = {
  // 组件库名称
  name: 'AIX Components',
  displayName: 'AIX 组件库',

  // 包相关
  packageScope: '@aix', // npm scope，如 @ant-design、@mui
  packagePrefix: 'aix', // 包前缀，用于生成二进制名称

  // 服务器标识
  serverName: 'AIX Components MCP Server',
  packageName: 'aix-components-mcp',

  // CLI 工具
  cliName: 'aix-mcp-server', // CLI 二进制名称
  cliDisplayName: 'AIX 组件库 MCP Server 命令行工具',

  // 版本信息
  version: '1.0.0',

  // 描述信息
  description: 'MCP server for AIX component library',
  shortDescription: 'AIX 组件库 MCP 服务器',

  // 注册表（可选）
  registry: 'https://it-artifactory.yitu-inc.com/api/npm/npm-local/',

  // 组件识别模式
  componentPatterns: {
    // Props 接口命名模式
    propsInterfacePattern: /^(\w+)Props$/,
    // 组件文件命名模式
    componentFilePattern: /^[A-Z][a-zA-Z0-9]*\.(ts|tsx)$/,
    // 组件导出模式
    componentExportPattern: /^[A-Z][a-zA-Z0-9]*$/,
  },

  // 默认包结构
  packageStructure: {
    srcDir: 'src',
    libDir: 'lib',
    distDir: 'dist',
    docsDir: 'docs',
    storiesDir: 'stories',
    examplesDir: 'examples',
  },
} as const;

// 从配置中导出常用常量（保持向后兼容）
export const PACKAGE_NAME = COMPONENT_LIBRARY_CONFIG.packageName;
export const CLI_BINARY_NAME = COMPONENT_LIBRARY_CONFIG.cliName;
export const SERVER_NAME = COMPONENT_LIBRARY_CONFIG.serverName;
export const SERVER_VERSION = COMPONENT_LIBRARY_CONFIG.version;
export const PACKAGE_SCOPE = COMPONENT_LIBRARY_CONFIG.packageScope;

// ========================================
// 模板化文本和消息 - 使用配置变量生成
// ========================================

/**
 * 动态生成的文本模板
 * 基于 COMPONENT_LIBRARY_CONFIG 生成个性化文本
 */
export const TEXT_TEMPLATES = {
  // CLI 相关消息
  cliWelcome: () =>
    `🚀 启动 ${COMPONENT_LIBRARY_CONFIG.displayName} MCP Server...`,
  cliSuccess: () =>
    `✅ ${COMPONENT_LIBRARY_CONFIG.displayName} MCP Server 已启动`,
  cliStop: () =>
    `🛑 停止 ${COMPONENT_LIBRARY_CONFIG.displayName} MCP Server...`,
  cliStopped: () =>
    `✅ ${COMPONENT_LIBRARY_CONFIG.displayName} MCP Server 已停止`,

  // WebSocket 相关消息
  wsStart: () =>
    `🌐 启动 ${COMPONENT_LIBRARY_CONFIG.displayName} MCP WebSocket Server...`,
  wsSuccess: (host: string, port: string | number) =>
    `✅ WebSocket 服务器启动成功! ws://${host}:${port}`,

  // 组件相关消息
  componentLoaded: (count: number) => `✅ 加载了 ${count} 个组件`,
  componentExtractStart: (count: number) => `📦 开始并发提取 ${count} 个包...`,
  componentExtractSuccess: (count: number) => `✅ 成功提取 ${count} 个组件`,

  // 工具描述
  toolDescription: () =>
    `列出所有可用的 ${COMPONENT_LIBRARY_CONFIG.displayName} 组件`,

  // 提示词前缀
  promptPrefix: () => COMPONENT_LIBRARY_CONFIG.packagePrefix,

  // Scope 处理
  removeScopeComment: () =>
    `移除 scope 前缀 (如 ${COMPONENT_LIBRARY_CONFIG.packageScope}/component-name -> component-name)`,

  // 导入示例
  importExample: (componentName: string, packageName: string) =>
    `import { ${componentName} } from '${COMPONENT_LIBRARY_CONFIG.packageScope}/${packageName}';`,

  typeImportExample: (typeName: string, packageName: string) =>
    `import type { ${typeName} } from '${COMPONENT_LIBRARY_CONFIG.packageScope}/${packageName}';`,
} as const;

/**
 * 提示词键值映射
 * 用于生成动态的提示词名称
 */
export const PROMPT_KEYS = {
  expert: `${COMPONENT_LIBRARY_CONFIG.packagePrefix}-expert`,
  query: `${COMPONENT_LIBRARY_CONFIG.packagePrefix}-query`,
  generation: `${COMPONENT_LIBRARY_CONFIG.packagePrefix}-generation`,
} as const;

/**
 * 资源 URI 模式
 */
export const RESOURCE_URI_PATTERNS = {
  componentSource: (packageName: string, fileName: string) =>
    `component-source://${COMPONENT_LIBRARY_CONFIG.packageScope}/${packageName}/${fileName}`,
  componentReadme: (packageName: string) =>
    `component-readme://${COMPONENT_LIBRARY_CONFIG.packageScope}/${packageName}/README.md`,
  componentStory: (packageName: string, fileName: string) =>
    `component-story://${COMPONENT_LIBRARY_CONFIG.packageScope}/${packageName}/${fileName}`,
  componentChangelog: (packageName: string) =>
    `component-changelog://${COMPONENT_LIBRARY_CONFIG.packageScope}/${packageName}/CHANGELOG.md`,
} as const;
