import { h } from 'vue';
import ImageThumb from '../components/ImageThumb.vue';
import type { MarkdownRenderers, MdToken } from './markdownWalker';
import { safeImageSrc } from './url';

export { __resetImageCache } from './imageLoadedCache';

const attr = (token: MdToken, name: string): string | undefined =>
  token.attrs?.find((a) => a[0] === name)?.[1];

/**
 * 内置图片渲染器：`image` token → 骨架占位版缩略图（ImageThumb 组件）。
 * 经 MarkdownRenderer 合并注册，用户 markdownRenderers.image 仍可整体覆盖。
 * 加载状态机与结构化 `image` 块渲染器（components/blocks/ImageBlock.vue）共用同一个 ImageThumb。
 */
export const imageRenderers: MarkdownRenderers = {
  image: ({ token }) => {
    // 与 walker 内置 image 渲染器同一条白名单（放行 data:image/*，拦 javascript: 等）：
    // 本渲染器在 MarkdownRenderer 里覆盖了内置那份，若只加固内置的等于没加固。
    // 不安全 src 归一为空串——ImageThumb 对空 src 走「失败占位 + alt」分支，不裂图。
    const src = safeImageSrc(attr(token, 'src')) ?? '';
    return h(ImageThumb, { src, alt: token.content || (attr(token, 'alt') ?? '') });
  },
};
