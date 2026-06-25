import { useLocale } from '@aix/hooks';
import { defineComponent, h, ref, watch, onBeforeUnmount } from 'vue';
// 务实取舍：与 diagramRenderers 同理——本文件是「组件工厂」（ImageBlock 即组件），
// 复用 components 层的 Skeleton 保证占位动效全包一致。
import Skeleton from '../components/Skeleton.vue';
import { locale } from '../locale';
import { transitionHeight } from './heightTransition';
import type { MarkdownRenderers, MdToken } from './markdownWalker';

/**
 * 已成功加载过的图片 URL（LRU 上限 200）：虚拟列表重挂载 / 同图复现时直接出图，不再闪骨架。
 * 设上限避免长会话中不断出现新 URL 导致 Set 无界增长（与 diagramRenderers 的 svgCache 同策略）。
 */
const loadedUrls = new Set<string>();
const LOADED_MAX = 200;
/** 命中即刷新热度（移到末尾），保证 LRU 淘汰恒为最久未访问项 */
const isLoaded = (url: string): boolean => {
  if (!loadedUrls.has(url)) return false;
  loadedUrls.delete(url);
  loadedUrls.add(url);
  return true;
};
const markLoaded = (url: string) => {
  loadedUrls.delete(url); // 已存在则先删，保证重新插入到末尾刷新热度
  loadedUrls.add(url);
  // Set 迭代顺序即插入顺序（ES2015 规范保证），values().next() 取最旧键淘汰
  if (loadedUrls.size > LOADED_MAX) loadedUrls.delete(loadedUrls.values().next().value!);
};

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
    // 失败占位兜底文案走 locale 体系（与 codeRenderers 一致），随语言切换响应式更新
    const { t } = useLocale(locale);
    const status = ref<'loading' | 'loaded' | 'error'>(isLoaded(props.src) ? 'loaded' : 'loading');
    // src 变化时复位（与 diagramRenderers 的 props 变化复位模式一致）：
    // 无 key 的同位置 patch 会复用本实例（消息编辑/重新生成后同位置换图），
    // 不复位则旧图的 error/loaded 态粘到新图——error 态下新图连预加载 img 都不渲染，永久卡死。
    watch(
      () => props.src,
      (src) => {
        status.value = isLoaded(src) ? 'loaded' : 'loading';
      },
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
      markLoaded(props.src);
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
    // 缓存命中直出的 <img> 实际加载仍可能失败（CDN 过期/网络变化）：
    // 切失败占位并清缓存（后续挂载回骨架重试），兑现「不裂图」承诺
    const onLoadedError = () => {
      loadedUrls.delete(props.src);
      status.value = 'error';
    };

    return () => {
      if (status.value === 'error' || !props.src) {
        // 失败占位：保留占位框与 alt 文案，避免浏览器默认裂图
        return h('span', { class: 'aix-md-image aix-md-image--error', role: 'img' }, [
          h('span', { 'aria-hidden': 'true' }, '🖼'),
          props.alt || props.src || t.value.imageLoadError,
        ]);
      }
      if (status.value === 'loaded') {
        return h('span', { ref: wrapper, class: 'aix-md-image' }, [
          h('img', {
            class: 'aix-md-image__img',
            src: props.src,
            alt: props.alt,
            onError: onLoadedError,
          }),
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
