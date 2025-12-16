/**
 * @fileoverview LaTeX 渲染器
 */

import type { RendererDefinition } from '../../core/types';
import { isLatex } from '../../utils/detect';

export interface LatexData {
  expression: string;
  displayMode?: boolean;
}

export const latexRenderer: RendererDefinition<LatexData> = {
  name: 'latex',
  type: 'latex',
  priority: 20, // 优先级高于 markdown
  streaming: false,
  description: 'LaTeX 数学公式渲染器',

  parser: (raw) => {
    // 检测是块级还是行内
    const isBlock = raw.startsWith('$$') || raw.startsWith('\\[');
    const expression = raw
      .replace(/^\$\$|\$\$$/g, '')
      .replace(/^\$|\$$/g, '')
      .replace(/^\\\[|\\\]$/g, '')
      .replace(/^\\\(|\\\)$/g, '')
      .trim();
    return { expression, displayMode: isBlock };
  },

  detector: isLatex,

  loader: () => import('./LatexRenderer.vue').then((m) => m.default),
};

export { default as LatexRenderer } from './LatexRenderer.vue';
