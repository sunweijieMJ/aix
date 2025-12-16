/**
 * @fileoverview Mermaid 渲染器
 */

import type { RendererDefinition } from '../../core/types';

export interface MermaidData {
  code: string;
}

export const mermaidRenderer: RendererDefinition<MermaidData> = {
  name: 'mermaid',
  type: 'mermaid',
  priority: 15,
  streaming: false,
  description: 'Mermaid 图表渲染器',

  parser: (raw) => {
    // 解析 ```mermaid\ncode\n``` 格式
    const match = raw.match(/^```mermaid\n([\s\S]*?)```$/);
    if (match && match[1] !== undefined) {
      return { code: match[1] };
    }
    // 如果没有代码块标记，直接返回原始内容
    return { code: raw.trim() };
  },

  detector: (raw) => {
    const trimmed = raw.trim();
    // 检测 ```mermaid 代码块
    if (/^```mermaid[\s\S]*```$/.test(trimmed)) return true;
    // 检测 mermaid 语法关键字（包括 mindmap、timeline、quadrantChart、xychart-beta、sankey-beta 等）
    return /^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|xychart-beta|sankey-beta|block-beta)\s/i.test(
      trimmed,
    );
  },

  loader: () => import('./MermaidRenderer.vue').then((m) => m.default),
};

export { default as MermaidRenderer } from './MermaidRenderer.vue';
