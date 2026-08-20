<template>
  <span v-if="status === 'error' || !safeSrc" class="aix-md-image aix-md-image--error" role="img">
    <span aria-hidden="true">🖼</span>
    {{ alt || safeSrc || t.imageLoadError }}
  </span>
  <span v-else-if="status === 'loaded'" ref="wrapper" class="aix-md-image">
    <img class="aix-md-image__img" :src="safeSrc" :alt="alt" @error="onLoadedError" />
  </span>
  <span v-else ref="wrapper" class="aix-md-image aix-md-image--loading">
    <Skeleton loading height="96px" />
    <img
      class="aix-md-image__preload"
      :src="safeSrc"
      alt=""
      aria-hidden="true"
      @load="onLoad"
      @error="onError"
    />
  </span>
</template>

<script lang="ts">
export interface ImageThumbProps {
  /** 图片地址 */
  src: string;
  /** 无障碍替代文本 */
  alt?: string;
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAiChatLocale } from '../composables/useAiChatLocale';
import { transitionHeight } from '../utils/heightTransition';
import { evictLoaded, isLoaded, markLoaded } from '../utils/imageLoadedCache';
import { safeImageSrc } from '../utils/url';
import Skeleton from './Skeleton.vue';

/**
 * 图片加载状态机（骨架占位版）：骨架 shimmer（隐藏预加载）→ onload 高度平滑过渡 + 淡入 →
 * onerror 占位框 + alt（不裂图）。被 markdown `image` token 渲染器（utils/imageRenderers.ts）
 * 与结构化 `image` 块渲染器（components/blocks/ImageBlock.vue）共用，避免两处各自维护一份加载态逻辑。
 */
const props = withDefaults(defineProps<ImageThumbProps>(), { alt: '' });
const { t } = useAiChatLocale();

/**
 * 协议白名单收口点：markdown 图片路径（utils/imageRenderers.ts）与结构化 `image` 块路径
 * （blocks/ImageBlock.vue → 本组件）的数据都来自模型 / 生图工具输出。放在本组件统一过滤，
 * 两条路径便共享同一层防护，上游重复调用 safeImageSrc 也无副作用（幂等）。不安全 src 归一为空串 → 走上方失败占位分支。
 */
const safeSrc = computed(() => safeImageSrc(props.src) ?? '');

const status = ref<'loading' | 'loaded' | 'error'>(isLoaded(safeSrc.value) ? 'loaded' : 'loading');
// src 变化时复位：无 key 的同位置 patch 会复用本实例（消息编辑/重新生成后同位置换图），
// 不复位则旧图的 error/loaded 态粘到新图——error 态下新图连预加载 img 都不渲染，永久卡死。
watch(safeSrc, (src) => {
  status.value = isLoaded(src) ? 'loaded' : 'loading';
});
const wrapper = ref<HTMLElement | null>(null);

let cancelFlip: (() => void) | null = null;
onBeforeUnmount(() => cancelFlip?.());

const onLoad = () => {
  if (status.value !== 'loading') return;
  // 高度平滑过渡（共享 FLIP）：记录骨架高 → 切换重渲染后（rAF）测真实高做 transition。
  const prevHeight = wrapper.value?.offsetHeight ?? 0;
  markLoaded(safeSrc.value);
  status.value = 'loaded';
  if (!prevHeight) return;
  requestAnimationFrame(() => {
    // 必须在这里**重新读** wrapper：loading 与 loaded 是两个 v-if 分支，切换后挂载的是另一个
    // 元素，沿用切换前捕获的引用拿到的是已脱离文档的骨架 span——它的 offsetHeight 恒为 0，
    // transitionHeight 首行即 return null，承诺的过渡从不发生、高度硬跳。
    // 同 MarkdownRenderer 在 onUpdated 里重新取 el 的处理。
    const el = wrapper.value;
    if (!el) return; // 同帧内又切走（如 src 变更回 loading / 组件已卸载）
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
  evictLoaded(safeSrc.value);
  status.value = 'error';
};
</script>
