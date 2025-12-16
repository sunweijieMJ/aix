/**
 * @fileoverview Markdown 渲染器
 */

import { marked } from 'marked';
import type { RendererDefinition } from '../../core/types';
import { isMarkdown } from '../../utils/detect';

export interface MarkdownData {
  html: string;
  raw: string;
}

export const markdownRenderer: RendererDefinition<MarkdownData> = {
  name: 'markdown',
  type: 'markdown',
  priority: 10,
  streaming: true,
  description: 'Markdown 渲染器',

  parser: (raw) => {
    const html = marked.parse(raw) as string;
    return { html, raw };
  },

  detector: isMarkdown,

  loader: () => import('./MarkdownRenderer.vue').then((m) => m.default),
};

export { default as MarkdownRenderer } from './MarkdownRenderer.vue';
