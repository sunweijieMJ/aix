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
 * 把一个渲染函数包装成合规的块渲染器组件（供 `blockRenderers` / `toolRenderers` 注册），
 * 收进手写函数式组件时必须记住的两行样板（`props` 与 `inheritAttrs`，漏任一件都静默出错，
 * 见上方 BLOCK_RENDERER_PROPS）。泛型参数用于收窄 `props.block`。
 *
 * 只面向「一层薄封装，把块数据转交给既有业务组件」；需要内部状态 / 生命周期 / 样式时
 * 仍应写 `.vue` 组件直接注册。用法示例见 README「薄封装用 defineBlockRenderer」。
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
