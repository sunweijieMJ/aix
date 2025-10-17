/**
 * Moho 地图库配置示例
 *
 * 这是为 Moho 地图组件库配置 MCP Server 的示例，展示了如何适配地图相关的组件库
 *
 * 使用方法：
 * 1. 复制此配置到 src/constants/library.ts 中替换 COMPONENT_LIBRARY_CONFIG
 * 2. 更新 package.json 中的相关信息
 * 3. 根据实际情况调整组件识别模式和包结构
 * 4. 运行 pnpm build 构建项目
 */

export const MOHO_COMPONENT_LIBRARY_CONFIG = {
  // 组件库名称
  name: 'Moho Map Components',
  displayName: 'Moho 地图组件库',

  // 包相关
  packageScope: '@moho', // Moho 的 npm scope
  packagePrefix: 'moho', // CLI 和工具前缀

  // 服务器标识
  serverName: 'Moho Map Components MCP Server',
  packageName: 'moho-map-components-mcp',

  // CLI 工具
  cliName: 'moho-mcp-server',
  cliDisplayName: 'Moho 地图组件库 MCP Server 命令行工具',

  // 版本信息
  version: '1.0.0',

  // 描述信息
  description: 'MCP server for Moho map component library',
  shortDescription: 'Moho 地图组件库 MCP 服务器',

  // 注册表（根据实际情况配置）
  registry: 'https://registry.npmjs.org/',

  // 地图组件的特殊识别模式
  componentPatterns: {
    // 地图组件通常有特殊的 Props 命名模式
    propsInterfacePattern: /^(Map\w+|Layer\w+|\w+)Props$/,

    // 地图组件文件可能包含 Map、Layer、Control 等前缀
    componentFilePattern:
      /^(Map|Layer|Control|Tool|Widget)?[A-Z][a-zA-Z0-9]*\.(ts|tsx)$/,

    // 地图组件导出模式，可能包含 Map、Layer 等前缀
    componentExportPattern:
      /^(Map|Layer|Control|Tool|Widget)?[A-Z][a-zA-Z0-9]*$/,
  },

  // Moho 地图库包结构
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
 * Moho 地图库特殊配置说明：
 *
 * 1. **地图组件特点**:
 *    - 组件通常围绕地图功能：Map, Layer, Control, Tool, Widget 等
 *    - Props 可能包含地理坐标、图层配置、交互事件等
 *    - 需要处理异步加载、大数据渲染等场景
 *
 * 2. **包命名规范**:
 *    - @moho/map-core - 核心地图组件
 *    - @moho/layer-vector - 矢量图层组件
 *    - @moho/control-zoom - 缩放控制组件
 *    - @moho/tool-draw - 绘制工具组件
 *    - @moho/widget-legend - 图例小部件
 *
 * 3. **组件识别增强**:
 *    - 支持 Map、Layer、Control 等地图专用前缀
 *    - 识别地图相关的 Props 和事件处理
 *    - 处理地图配置和样式定义
 *
 * 4. **特殊功能支持**:
 *    - 地图坐标系统文档提取
 *    - 图层配置示例生成
 *    - 地图事件处理说明
 *    - 地理数据格式支持
 *
 * 5. **示例组件类型**:
 *    - MapContainer: 地图容器组件
 *    - VectorLayer: 矢量图层组件
 *    - MarkerCluster: 标记聚合组件
 *    - DrawingTool: 绘制工具组件
 *    - LegendWidget: 图例组件
 */

/**
 * 提示词定制示例（需要在 src/prompts/index.ts 中应用）:
 */
export const MOHO_CUSTOM_PROMPTS = {
  expert: `
# Moho 地图组件库开发专家

你是一个专业的地图组件库开发专家，深入了解 Moho 地图组件库的架构和地图可视化最佳实践。

## 专业技能

### 地图组件深度理解
- 精通 Moho 地图组件库的设计理念和地图渲染架构
- 熟悉各种地图组件的功能特性、使用场景和性能优化
- 了解地图坐标系统、投影变换和空间数据处理

### 地图可视化专长
- 熟练掌握矢量图层、栅格图层、热力图等各种图层类型
- 深入理解地图交互、缩放控制、图层管理等核心功能
- 精通地图数据绑定、动态更新和实时渲染技术

## 提供帮助

- 地图组件选择和配置指导
- 地图性能优化和最佳实践
- 地图数据处理和可视化方案
- 空间分析和地理计算支持
`,

  query: `
# Moho 地图组件库查询助手

你可以帮助用户查询和使用 Moho 地图组件库中的地图组件。

## 可用功能

### 地图组件查询
- 按功能搜索：地图容器、图层管理、控制工具等
- 按类型筛选：核心组件、图层组件、控制组件、工具组件
- 按应用场景：数据可视化、地理分析、导航应用等

### 地图配置指导
- 地图初始化配置
- 图层叠加和样式设置
- 交互事件和控制器配置
- 数据源接入和格式转换
`,
} as const;
