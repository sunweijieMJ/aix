/**
 * AIX 组件库配置示例（当前项目配置）
 *
 * 这是当前项目正在使用的配置，展示了如何为 AIX 组件库配置 MCP Server
 *
 * 使用方法：
 * 此配置已经应用在 src/constants/library.ts 中，这里仅作为参考
 */

export const AIX_COMPONENT_LIBRARY_CONFIG = {
  // 组件库名称
  name: 'AIX Components',
  displayName: 'AIX 组件库',

  // 包相关
  packageScope: '@aix', // AIX 的 npm scope
  packagePrefix: 'aix', // CLI 和工具前缀

  // 服务器标识
  serverName: 'AIX Components MCP Server',
  packageName: 'aix-components-mcp',

  // CLI 工具
  cliName: 'aix-mcp-server',
  cliDisplayName: 'AIX 组件库 MCP Server 命令行工具',

  // 版本信息
  version: '1.0.0',

  // 描述信息
  description: 'MCP server for AIX component library',
  shortDescription: 'AIX 组件库 MCP 服务器',

  // AIX 内部 npm 注册表
  registry: 'https://it-artifactory.yitu-inc.com/api/npm/npm-local/',

  // 组件识别模式
  componentPatterns: {
    // AIX 使用标准的 Props 后缀
    propsInterfacePattern: /^(\w+)Props$/,
    // 组件文件命名：Button.tsx, Input.tsx 等
    componentFilePattern: /^[A-Z][a-zA-Z0-9]*\.(ts|tsx)$/,
    // 组件导出：export { Button, Input }
    componentExportPattern: /^[A-Z][a-zA-Z0-9]*$/,
  },

  // AIX 组件库包结构
  packageStructure: {
    srcDir: 'src', // 源码目录
    libDir: 'lib', // 编译后目录
    distDir: 'dist', // 分发目录
    docsDir: 'docs', // 文档目录
    storiesDir: 'stories', // Storybook 目录
    examplesDir: 'examples', // 示例目录
  },
} as const;

/**
 * 配置说明：
 *
 * 1. **包 Scope**: @aix
 *    - 所有 AIX 组件包都使用 @aix scope
 *    - 如：@aix/button, @aix/input, @aix/form 等
 *
 * 2. **CLI 工具**: aix-mcp-server
 *    - 安装后可通过 `aix-mcp-server` 命令使用
 *    - 提供组件提取、服务器启动等功能
 *
 * 3. **注册表**: AIX 内部私有注册表
 *    - 用于发布和安装 AIX 内部包
 *    - 需要相应的认证配置
 *
 * 4. **组件识别**: 标准 Vue/TypeScript 模式
 *    - Props 接口：ButtonProps, InputProps 等
 *    - 文件命名：PascalCase + .tsx/.ts
 *    - 导出模式：命名导出
 */
