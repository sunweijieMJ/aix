/**
 * @fileoverview Code 渲染器
 */

import type { RendererDefinition } from '../../core/types';
import { isCodeBlock } from '../../utils/detect';

export interface CodeData {
  code: string;
  language?: string;
}

export const codeRenderer: RendererDefinition<CodeData> = {
  name: 'code',
  type: 'code',
  priority: 15,
  streaming: true,
  description: '代码块渲染器',

  parser: (raw): CodeData => {
    // 解析 ```lang\ncode\n``` 格式
    const match = raw.match(/^```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```$/);
    if (match && match[2] !== undefined) {
      return { code: match[2], language: match[1] || 'text' };
    }
    return { code: raw, language: 'text' };
  },

  detector: isCodeBlock,

  loader: () => import('./CodeRenderer.vue').then((m) => m.default),
};

export { default as CodeRenderer } from './CodeRenderer.vue';
