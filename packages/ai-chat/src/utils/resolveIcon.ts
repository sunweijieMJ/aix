import { h } from 'vue';
import type { Component } from 'vue';

/**
 * 图标取值：Vue 组件，或图片地址（URL / data-URI）。
 * 与 `SenderIcons` / `AttachmentsPanelIcons` 各键的类型一致。
 */
export type IconSource = Component | string;

/**
 * 字符串地址 → 函数式组件的缓存。
 *
 * 必须缓存：`<component :is>` 按**组件身份**决定复用还是重挂载，每次渲染现建一个箭头函数
 * 会让图标在每帧被卸载重挂（`<img>` 随之重新发起请求、闪一下）。
 * 键是 URL 本身，图标地址在实践中是极小的固定集合，不做淘汰。
 */
const imgIconCache = new Map<string, Component>();

/**
 * 归一图标取值为可交给 `<component :is>` 的组件。
 *
 * - 组件：原样返回；
 * - 字符串：包成渲染 `<img>` 的函数式组件（`alt=""`，图标是纯装饰，可及名来自按钮的 aria-label；
 *   使用侧另加的 `aria-hidden` 经 attrs 落到 img 上）；
 * - 空值：回退 `fallback`；未给 fallback 则返回 `undefined`，
 *   供「没有组件形态的兜底图标」的调用点（如发送键的内置 CSS mask 分支）用 `v-if` 二选一。
 */
export function resolveIcon(src: IconSource | undefined, fallback: Component): Component;
export function resolveIcon(
  src: IconSource | undefined,
  fallback?: Component,
): Component | undefined;
export function resolveIcon(
  src: IconSource | undefined,
  fallback?: Component,
): Component | undefined {
  if (!src) return fallback;
  if (typeof src !== 'string') return src;
  let comp = imgIconCache.get(src);
  if (!comp) {
    // 必须显式把 attrs 摊到 img 上：函数式组件**未声明 props** 时，Vue 会把所有传入属性
    // 都当作 props 交给第一个参数，自动 fallthrough 那条路不再生效——使用侧写的
    // `aria-hidden="true"` 会被静默吞掉（图标本是纯装饰，丢了它屏幕阅读器就会多念一个图形）。
    // attrs 放在最后展开：使用侧显式传的 alt / class 等应当压过这里的默认值。
    comp = (_props, { attrs }) => h('img', { src, alt: '', ...attrs });
    imgIconCache.set(src, comp);
  }
  return comp;
}
