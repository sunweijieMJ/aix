/**
 * Vue 模板编译期 nodeTransform：剥离 data-figma 标记属性
 *
 * 开发阶段 figma-to-component 生成的组件带 data-figma="<nodeId>" 供 fidelity 匹配，
 * 生产构建通过本 transform 移除。同时处理静态属性与 :data-figma 动态绑定。
 *
 * 用法（vite.config.ts）：
 *   vue({ template: { compilerOptions: { nodeTransforms: mode === 'production' ? [stripFigmaAttrs()] : [] } } })
 *
 * 不依赖 @vue/compiler-core 类型，按 NodeTypes 常量值做结构判断。
 */

/** @vue/compiler-core NodeTypes 的相关常量值 */
const NODE_ELEMENT = 1;
const PROP_ATTRIBUTE = 6;
const PROP_DIRECTIVE = 7;

interface TemplateProp {
  type: number;
  name: string;
  arg?: { type: number; content?: string; isStatic?: boolean };
}

interface TemplateNode {
  type: number;
  props?: TemplateProp[];
}

export interface StripFigmaAttrsOptions {
  /** 要剥离的属性名，默认 ['data-figma'] */
  attrs?: string[];
}

/**
 * 返回可直接放入 compilerOptions.nodeTransforms 的函数
 */
export function stripFigmaAttrs(options: StripFigmaAttrsOptions = {}): (node: unknown) => void {
  const names = new Set(options.attrs ?? ['data-figma']);

  return (raw: unknown) => {
    const node = raw as TemplateNode;
    if (!node || node.type !== NODE_ELEMENT || !Array.isArray(node.props)) return;

    node.props = node.props.filter((prop) => {
      // 静态：data-figma="12:34"
      if (prop.type === PROP_ATTRIBUTE) return !names.has(prop.name);
      // 动态：:data-figma="id" / v-bind:data-figma
      if (prop.type === PROP_DIRECTIVE && prop.name === 'bind' && prop.arg?.isStatic !== false) {
        const arg = prop.arg?.content;
        return !(arg && names.has(arg));
      }
      return true;
    });
  };
}
