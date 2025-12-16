/**
 * @fileoverview 预设插件集合
 */

import { chartRenderer } from '../renderers/chart';
import { codeRenderer } from '../renderers/code';
import { latexRenderer } from '../renderers/latex';
import { markdownRenderer } from '../renderers/markdown';
import { mermaidRenderer } from '../renderers/mermaid';
import { mindmapRenderer } from '../renderers/mindmap';
import { textRenderer } from '../renderers/text';
import type { ChatUIPlugin } from './createPlugin';
import { createPlugin } from './createPlugin';

// =============================================================================
// 单独的插件
// =============================================================================

/** 文本渲染器插件 */
export const textPlugin = createPlugin('text', textRenderer, {
  description: '纯文本渲染',
});

/** Markdown 渲染器插件 */
export const markdownPlugin = createPlugin('markdown', markdownRenderer, {
  description: 'Markdown 渲染',
});

/** 代码渲染器插件 */
export const codePlugin = createPlugin('code', codeRenderer, {
  description: '代码块渲染（支持语法高亮）',
});

/** LaTeX 渲染器插件 */
export const latexPlugin = createPlugin('latex', latexRenderer, {
  description: 'LaTeX 数学公式渲染',
});

/** 图表渲染器插件 */
export const chartPlugin = createPlugin('chart', chartRenderer, {
  description: '图表渲染（ECharts）',
});

/** Mermaid 渲染器插件 */
export const mermaidPlugin = createPlugin('mermaid', mermaidRenderer, {
  description: 'Mermaid 图表渲染（流程图、时序图等）',
});

/** 思维导图渲染器插件 */
export const mindmapPlugin = createPlugin('mindmap', mindmapRenderer, {
  description: '思维导图渲染（G6）',
});

// =============================================================================
// 预设集合
// =============================================================================

/**
 * 基础插件集（轻量）
 * 包含：text, markdown
 */
export const basicPlugins: ChatUIPlugin[] = [textPlugin, markdownPlugin];

/**
 * 标准插件集
 * 包含：text, markdown, code, latex
 */
export const standardPlugins: ChatUIPlugin[] = [
  ...basicPlugins,
  codePlugin,
  latexPlugin,
];

/**
 * 完整插件集（包含所有内置渲染器）
 * 注意：chart、mermaid、mindmap 较重，按需加载
 */
export const fullPlugins: ChatUIPlugin[] = [
  ...standardPlugins,
  chartPlugin,
  mermaidPlugin,
  mindmapPlugin,
];

/**
 * 创建自定义插件集
 */
export function createPluginPreset(
  base: 'basic' | 'standard' | 'full',
  options?: {
    /** 额外添加的插件 */
    extra?: ChatUIPlugin[];
    /** 排除的插件名称 */
    exclude?: string[];
  },
): ChatUIPlugin[] {
  let plugins: ChatUIPlugin[];

  switch (base) {
    case 'basic':
      plugins = [...basicPlugins];
      break;
    case 'standard':
      plugins = [...standardPlugins];
      break;
    case 'full':
      plugins = [...fullPlugins];
      break;
    default:
      plugins = [...basicPlugins];
  }

  // 排除指定插件
  if (options?.exclude?.length) {
    plugins = plugins.filter((p) => !options.exclude!.includes(p.name));
  }

  // 添加额外插件
  if (options?.extra?.length) {
    plugins.push(...options.extra);
  }

  return plugins;
}
