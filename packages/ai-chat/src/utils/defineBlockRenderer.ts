import { defineComponent } from 'vue';
import type { Component, VNode } from 'vue';
import type { BlockRendererProps, ContentBlockRegistry } from '../types';

/**
 * Bubble 向每个块渲染器注入的 prop 名（与 `BlockRendererProps` + ToolUseBlock 的 `toolRenderers`
 * 一一对应）。必须逐个显式声明：函数式组件不声明 props 时，Vue 会把它们**全部**当作
 * fallthrough attrs，于是 `block` 拿不到，而 `info` / `typing` / `onBlockAction` 等会以
 * `info="[object Object]"` 之类的形态糊到渲染结果的根元素上。
 */
const BLOCK_RENDERER_PROPS = [
  'block',
  'info',
  'typing',
  'onBlockAction',
  'onBlockIntent',
  'toolRenderers',
] as const;

/**
 * 把一个渲染函数包装成合规的块渲染器组件（供 `blockRenderers` / `toolRenderers` 注册）。
 *
 * 直接写函数式组件是可以的，但要**同时**记住两件在文档里各自散落的事，漏掉任何一件都会静默出错：
 *
 * ```ts
 * // 手写版：三行样板，且两行都是「不写就出 bug」而非「不写就少个优化」
 * const ResourceBlock = (props) => h(Resource, { data: props.block?.items ?? [] });
 * ResourceBlock.props = ['block'];        // 漏了 → props.block 恒为 undefined
 * ResourceBlock.inheritAttrs = false;     // 漏了 → 内部 prop 变成根元素上的无效 DOM 属性
 * ```
 *
 * 用本函数则只需关心渲染本身：
 *
 * ```ts
 * import { defineBlockRenderer } from '@aix/ai-chat';
 *
 * const blockRenderers = {
 *   resource: defineBlockRenderer((props) => h(Resource, { data: props.block.items ?? [] })),
 * };
 * ```
 *
 * 泛型参数用于收窄 `props.block`（需先经 module augmentation 扩展 `ContentBlockRegistry`）：
 * `defineBlockRenderer<'resource'>((p) => ...)` 里的 `p.block` 即为 resource 块类型。
 *
 * 需要完整 SFC 能力（内部状态、生命周期、样式）时仍应写 `.vue` 组件并直接注册——
 * 本函数只面向「一层薄封装，把块数据转交给既有业务组件」这个最常见的场景。
 *
 * @param render 渲染函数，接收块渲染器契约 props，返回 VNode（返回 null 即不渲染该块）
 * @param name   可选组件名，仅影响 devtools / 警告信息中的显示
 */
export function defineBlockRenderer<
  K extends keyof ContentBlockRegistry = keyof ContentBlockRegistry,
>(render: (props: BlockRendererProps<K>) => VNode | null, name = 'AixBlockRenderer'): Component {
  return defineComponent({
    name,
    // 与内置渲染器（如 ReasoningBlock）同约定：注册表统一透传的这几个 prop 不该继续落到根元素上
    inheritAttrs: false,
    props: BLOCK_RENDERER_PROPS as unknown as string[],
    setup(props) {
      return () => render(props as unknown as BlockRendererProps<K>);
    },
  });
}
