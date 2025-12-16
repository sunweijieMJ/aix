/**
 * @fileoverview Plugins 模块导出
 */

export {
  createPlugin,
  installPlugin,
  installPlugins,
  uninstallPlugin,
  isPluginInstalled,
  getInstalledPlugins,
  getInstalledPluginNames,
  resetPlugins,
  getPluginDependencyTree,
  detectCircularDependency,
  CircularDependencyError,
  PluginInstallError,
} from './createPlugin';

export type { ChatUIPlugin, PluginInstallOptions } from './createPlugin';

export {
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
} from './presets';
