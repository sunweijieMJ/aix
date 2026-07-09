import { createLruCache } from './lruCache';

/**
 * 已成功加载过的图片 URL（LRU 上限 200）：虚拟列表重挂载 / 同图复现时直接出图，不再闪骨架。
 * 「是否加载过」是集合语义，故以 value 恒为 true 的占位形式复用共享 LRU 工厂（与 svgCache 同策略）；
 * has 命中即刷新热度，越界淘汰最久未访问项，避免长会话中新 URL 无界增长。
 * ImageThumb.vue（markdown 内嵌图片 / 结构化 image 块共用）唯一消费方。
 */
const loadedUrls = createLruCache<string, true>(200);

export const isLoaded = (url: string): boolean => loadedUrls.has(url);
export const markLoaded = (url: string) => loadedUrls.set(url, true);
/** 缓存命中直出但实际加载失败时清除，后续挂载回骨架态重试（兑现「不裂图」承诺） */
export const evictLoaded = (url: string) => loadedUrls.delete(url);

/** 测试用：清空已加载缓存 */
export function __resetImageCache() {
  loadedUrls.clear();
}
