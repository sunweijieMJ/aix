/**
 * @fileoverview Core 模块导出
 */

// 类型
export type * from './types';

// 渲染器注册中心
export {
  rendererRegistry,
  registerRenderer,
  registerRenderers,
  unregisterRenderer,
  getRenderer,
  getRendererByType,
  detectRenderer,
} from './RendererRegistry';

// 内容解析器
export { ContentParser } from './ContentParser';

// 组件
export { default as ContentRenderer } from './ContentRenderer.vue';
export { default as DynamicRenderer } from './DynamicRenderer.vue';
export { default as AnimationText } from './AnimationText.vue';
