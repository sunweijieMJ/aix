import { defineComponent, h, ref, onBeforeUnmount } from 'vue';
// 务实取舍：与 diagramRenderers 同理——本文件是「组件工厂」（ImageBlock 即组件），
// 复用 components 层的 Skeleton 保证占位动效全包一致。
import Skeleton from '../components/Skeleton.vue';
import { transitionHeight } from './heightTransition';
import type { MarkdownRenderers, MdToken } from './markdownWalker';

/** 已成功加载过的图片 URL：虚拟列表重挂载 / 同图复现时直接出图，不再闪骨架 */
const loadedUrls = new Set<string>();

/** 测试用：清空已加载缓存 */
export function __resetImageCache() {
  loadedUrls.clear();
}

const attr = (token: MdToken, name: string): string | undefined =>
  token.attrs?.find((a) => a[0] === name)?.[1];

/**
 * 内置图片渲染器（骨架占位版）：
 * 骨架 shimmer（隐藏预加载）→ onload 高度平滑过渡 + 淡入 → onerror 占位框 + alt（不裂图）。
 * 经 MarkdownRenderer 合并注册，用户 markdownRenderers.image 仍可整体覆盖。
 */
const ImageBlock = defineComponent({
  name: 'AixImageBlock',
  props: {
    src: { type: String, required: true },
    alt: { type: String, default: '' },
  },
  setup(props) {
    const status = ref<'loading' | 'loaded' | 'error'>(
      loadedUrls.has(props.src) ? 'loaded' : 'loading',
    );
    const wrapper = ref<HTMLElement | null>(null);

    let cancelFlip: (() => void) | null = null;
    // 卸载时打断进行中的过渡：清理兜底定时器与监听，不持有已脱离元素
    onBeforeUnmount(() => cancelFlip?.());

    const onLoad = () => {
      if (status.value !== 'loading') return;
      // 高度平滑过渡（共享 FLIP）：记录骨架高 → 切换重渲染后（rAF）测真实高做 transition。
      // jsdom 无布局（offsetHeight=0）由 transitionHeight 内部跳过，不影响测试与 SSR。
      const el = wrapper.value;
      const prevHeight = el?.offsetHeight ?? 0;
      loadedUrls.add(props.src);
      status.value = 'loaded';
      if (!el || !prevHeight) return;
      requestAnimationFrame(() => {
        cancelFlip?.();
        cancelFlip = transitionHeight(el, prevHeight);
      });
    };
    const onError = () => {
      status.value = 'error';
    };

    return () => {
      if (status.value === 'error' || !props.src) {
        // 失败占位：保留占位框与 alt 文案，避免浏览器默认裂图
        return h('span', { class: 'aix-md-image aix-md-image--error', role: 'img' }, [
          h('span', { 'aria-hidden': 'true' }, '🖼'),
          props.alt || props.src || '图片加载失败',
        ]);
      }
      if (status.value === 'loaded') {
        return h('span', { ref: wrapper, class: 'aix-md-image' }, [
          h('img', { class: 'aix-md-image__img', src: props.src, alt: props.alt }),
        ]);
      }
      // 骨架态：shimmer 占位 + 隐藏的预加载 img（触发 onload/onerror）
      return h('span', { ref: wrapper, class: 'aix-md-image aix-md-image--loading' }, [
        h(Skeleton, { loading: true, height: '96px' }),
        h('img', {
          class: 'aix-md-image__preload',
          src: props.src,
          alt: '',
          'aria-hidden': 'true',
          onLoad,
          onError,
        }),
      ]);
    };
  },
});

export const imageRenderers: MarkdownRenderers = {
  image: ({ token }) => {
    const src = attr(token, 'src') ?? '';
    return h(ImageBlock, { src, alt: token.content || (attr(token, 'alt') ?? '') });
  },
};
