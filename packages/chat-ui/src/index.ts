/**
 * @fileoverview @aix/chat-ui 入口文件
 * AI 聊天 UI 渲染组件库
 */

// 导入样式
import './style/index.scss';

// =============================================================================
// Core - 核心模块
// =============================================================================
export {
  // 组件
  ContentRenderer,
  DynamicRenderer,
  AnimationText,
  // 渲染器注册
  rendererRegistry,
  registerRenderer,
  registerRenderers,
  unregisterRenderer,
  getRenderer,
  getRendererByType,
  detectRenderer,
  // 内容解析
  ContentParser,
} from './core';

// 类型导出
export type {
  // 内容类型
  ContentType,
  BuiltInContentType,
  ContentBlock,
  ContentBlockStatus,
  // 渲染器
  RendererDefinition,
  RendererProps,
  RendererEmits,
  RendererActionEvent,
  // 流式渲染
  StreamStatus,
  StreamingConfig,
  TypingAnimationConfig,
  // 组件 Props
  ContentRendererProps,
  ContentRendererEmits,
} from './core';

// =============================================================================
// Composables - Vue Hooks
// =============================================================================
export { useTyping, useStreaming, useContentRenderer } from './composables';

// =============================================================================
// Plugins - 插件系统
// =============================================================================
export {
  // 插件操作
  createPlugin,
  installPlugin,
  installPlugins,
  uninstallPlugin,
  isPluginInstalled,
  getInstalledPlugins,
  getInstalledPluginNames,
  resetPlugins,
  // 循环依赖检测
  getPluginDependencyTree,
  detectCircularDependency,
  CircularDependencyError,
  PluginInstallError,
  // 单独插件
  textPlugin,
  markdownPlugin,
  codePlugin,
  latexPlugin,
  chartPlugin,
  mermaidPlugin,
  mindmapPlugin,
  // 预设集合
  basicPlugins,
  standardPlugins,
  fullPlugins,
  createPluginPreset,
} from './plugins';

export type { ChatUIPlugin, PluginInstallOptions } from './plugins';

// =============================================================================
// Renderers - 内置渲染器
// =============================================================================
export {
  // 渲染器定义
  textRenderer,
  markdownRenderer,
  codeRenderer,
  latexRenderer,
  chartRenderer,
  mermaidRenderer,
  mindmapRenderer,
  // 渲染器组件
  TextRenderer,
  MarkdownRenderer,
  CodeRenderer,
  LatexRenderer,
  ChartRenderer,
  MermaidRenderer,
  MindmapRenderer,
  // 检测函数
  isMindmapJson,
} from './renderers';

export type {
  MarkdownData,
  CodeData,
  LatexData,
  ChartData,
  MermaidData,
  MindmapData,
  MindmapNode,
  MindmapLayoutType,
} from './renderers';

// =============================================================================
// Utils - 工具函数
// =============================================================================
export {
  generateId,
  sanitizeHtml,
  detectContentType,
  isLatex,
  isChartJson,
  isMermaid,
  isCodeBlock,
  isHtml,
  isMarkdown,
  // 未闭合标签检测
  detectUnclosedTags,
  isTagUnclosed,
  getStreamStatus,
  isCodeBlockUnclosed,
  autoCloseCodeBlock,
  // 渲染器类型工具
  getRendererPrimaryType,
  getRendererTypes,
  rendererSupportsType,
} from './utils';

// =============================================================================
// Setup - 初始化函数
// =============================================================================
import { installPlugins } from './plugins';
import { basicPlugins, standardPlugins, fullPlugins } from './plugins/presets';

/** 初始化配置选项 */
export interface SetupOptions {
  /**
   * 预设插件集
   * - 'basic': text + markdown (默认)
   * - 'standard': basic + code + latex
   * - 'full': standard + chart + mermaid
   * - 'none': 不安装任何插件
   */
  preset?: 'none' | 'basic' | 'standard' | 'full';
}

/** 是否已初始化 */
let initialized = false;

/**
 * 初始化 chat-ui
 * 必须在使用组件前调用此函数
 *
 * @example
 * ```ts
 * import { setup } from '@aix/chat-ui';
 *
 * // 使用基础预设（默认）
 * setup();
 *
 * // 使用标准预设
 * setup({ preset: 'standard' });
 *
 * // 不安装任何预设，手动注册
 * setup({ preset: 'none' });
 * installPlugin(myCustomPlugin);
 * ```
 */
export function setup(options: SetupOptions = {}): void {
  if (initialized) {
    console.warn('[chat-ui] 已经初始化，重复调用将被忽略');
    return;
  }

  const { preset = 'basic' } = options;

  switch (preset) {
    case 'none':
      // 不安装任何插件
      break;
    case 'basic':
      installPlugins(basicPlugins);
      break;
    case 'standard':
      installPlugins(standardPlugins);
      break;
    case 'full':
      installPlugins(fullPlugins);
      break;
  }

  initialized = true;
}

/**
 * 重置初始化状态（仅用于测试）
 * @internal
 */
export function resetSetup(): void {
  initialized = false;
}
