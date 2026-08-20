import { Comment, Fragment, isVNode } from 'vue';

/**
 * 判断单个 vnode 是否有**实际内容**（用于「插槽声明了、但这一条渲染为空」时不套包裹层）。
 *
 * - `Comment`（`v-if` 为假的编译产物）视为空；
 * - `Fragment` / 普通元素都递归看 children 是否全空——消费方为规避 Vue `renderSlot` 的
 *   「插槽产出全是 Comment 就判定插槽未提供」陷阱（见 `AiChat.vue` 的
 *   `<slot name="footer"><BubbleActions /></slot>` 兜底机制），常会包一层恒定渲染的占位标签
 *   （如 `<div style="display:contents">`）再在内部 `v-if`；这种写法编译后占位标签的 children
 *   是长度为 1 的数组（真实 vnode 或 Comment 占位），并非空数组，因此必须递归判断子节点
 *   而非只看数组是否为空；
 * - 无 children（如 `<img/>` 等自闭合真实内容标签）视为有内容。
 */
export function hasVNodeContent(vnode: unknown): boolean {
  if (!isVNode(vnode)) return true;
  if (vnode.type === Comment) return false;
  if (vnode.type === Fragment || typeof vnode.type === 'string') {
    if (!Array.isArray(vnode.children)) return true;
    return vnode.children.some(hasVNodeContent);
  }
  return true;
}

/**
 * 插槽这一次调用是否产出了实际内容。`nodes` 为 `slots.x?.(scope)` 的返回值，
 * 未声明该插槽（`undefined`）同样视为无内容。
 */
export function slotHasContent(nodes: unknown[] | undefined): boolean {
  return !!nodes && nodes.some(hasVNodeContent);
}
