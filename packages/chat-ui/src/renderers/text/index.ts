/**
 * @fileoverview Text 渲染器
 */

import type { RendererDefinition } from '../../core/types';

export const textRenderer: RendererDefinition<string> = {
  name: 'text',
  type: 'text',
  priority: -10, // 最低优先级，作为 fallback
  streaming: true,
  description: '纯文本渲染器',

  parser: (raw) => raw,

  // 不设置 detector，作为默认 fallback
  detector: undefined,

  loader: () => import('./TextRenderer.vue').then((m) => m.default),
};

export { default as TextRenderer } from './TextRenderer.vue';
