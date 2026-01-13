import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import type { SdkLoaderConfig } from '../types';

/**
 * useSdkLoader 返回类型
 */
export interface UseSdkLoaderReturn<T> {
  sdk: ShallowRef<T | null>;
  isLoading: Ref<boolean>;
  isLoaded: Ref<boolean>;
  error: Ref<Error | null>;
  load: () => Promise<T | null>;
  clearCache: () => void;
  isSupported: () => boolean;
}

// SDK 加载状态缓存 (全局单例)
const sdkCache = new Map<string, Promise<unknown>>();

// CSS 加载缓存 (存储 link 元素引用)
const cssCache = new Map<string, HTMLLinkElement>();

/**
 * 动态加载 CSS 文件
 * 用于 SDK 的 beforeLoad 钩子中加载额外的样式依赖
 */
export function loadCss(
  href: string,
  layerName?: string,
): Promise<HTMLLinkElement> {
  const cached = cssCache.get(href);
  if (cached) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `link[href="${href}"]`,
    ) as HTMLLinkElement;
    if (existing) {
      cssCache.set(href, existing);
      resolve(existing);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;

    if (layerName) {
      link.setAttribute('data-css-layer', layerName);
    }

    link.onload = () => {
      cssCache.set(href, link);
      resolve(link);
    };

    link.onerror = () => {
      reject(new Error(`CSS 加载失败: ${href}`));
    };

    document.head.appendChild(link);
  });
}

/**
 * 移除 CSS 文件
 */
export function removeCss(href: string): void {
  const link = cssCache.get(href);
  if (link && link.parentNode) {
    link.parentNode.removeChild(link);
    cssCache.delete(href);
  }
}

/**
 * SDK 动态加载器
 * 支持 ES 模块和 CDN 脚本两种加载方式
 */
export function useSdkLoader<T = unknown>(
  config: SdkLoaderConfig,
): UseSdkLoaderReturn<T> {
  const sdk = shallowRef<T | null>(null);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<Error | null>(null);

  /**
   * 通过 CDN 脚本加载 SDK
   */
  async function loadFromCdn(): Promise<T> {
    if (!config.cdnUrl || !config.globalName) {
      throw new Error(`[SdkLoader] ${config.name}: CDN 配置不完整`);
    }

    // 检查是否已加载
    const globalSdk = (window as unknown as Record<string, unknown>)[
      config.globalName
    ];
    if (globalSdk) {
      return globalSdk as T;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = config.cdnUrl!;
      script.async = true;

      script.onload = () => {
        const loadedSdk = (window as unknown as Record<string, unknown>)[
          config.globalName!
        ];
        if (loadedSdk) {
          resolve(loadedSdk as T);
        } else {
          reject(
            new Error(
              `[SdkLoader] ${config.name}: 全局变量 ${config.globalName} 未找到`,
            ),
          );
        }
      };

      script.onerror = () => {
        reject(new Error(`[SdkLoader] ${config.name}: CDN 加载失败`));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * 通过 ES 模块加载 SDK
   */
  async function loadFromModule(): Promise<T> {
    if (!config.importFn) {
      throw new Error(`[SdkLoader] ${config.name}: 未配置 importFn`);
    }

    const module = await config.importFn();
    // 处理 default 导出
    return (module as { default?: T }).default || (module as T);
  }

  /**
   * 加载 SDK
   */
  async function load(): Promise<T | null> {
    // 如果已加载，直接返回
    if (isLoaded.value && sdk.value) {
      return sdk.value;
    }

    // 检查缓存
    const cacheKey = config.name;
    if (sdkCache.has(cacheKey)) {
      try {
        const cachedSdk = (await sdkCache.get(cacheKey)) as T;
        sdk.value = cachedSdk;
        isLoaded.value = true;
        return cachedSdk;
      } catch {
        // 缓存的 Promise 失败，清除缓存重试
        sdkCache.delete(cacheKey);
      }
    }

    isLoading.value = true;
    error.value = null;

    // 创建加载 Promise 并缓存
    const loadPromise = (async () => {
      try {
        // 执行前置加载 (如 CSS)
        if (config.beforeLoad) {
          await config.beforeLoad();
        }

        let loadedSdk: T;

        // 优先使用 ES 模块加载
        if (config.importFn) {
          loadedSdk = await loadFromModule();
        } else if (config.cdnUrl) {
          loadedSdk = await loadFromCdn();
        } else {
          throw new Error(`[SdkLoader] ${config.name}: 未配置加载方式`);
        }

        sdk.value = loadedSdk;
        isLoaded.value = true;
        return loadedSdk;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        error.value = err;

        // 加载失败时，从缓存中删除，允许重试
        sdkCache.delete(cacheKey);

        if (config.required) {
          throw err;
        }

        console.warn(`[SdkLoader] ${config.name} 加载失败:`, err.message);
        return null;
      } finally {
        isLoading.value = false;
      }
    })();

    sdkCache.set(cacheKey, loadPromise);

    return loadPromise;
  }

  /**
   * 清除 SDK 缓存（用于重新加载场景）
   */
  function clearCache(): void {
    const cacheKey = config.name;
    sdkCache.delete(cacheKey);
    sdk.value = null;
    isLoaded.value = false;
    error.value = null;
  }

  /**
   * 检查 SDK 是否可用
   */
  function isSupported(): boolean {
    return isLoaded.value && sdk.value !== null;
  }

  return {
    sdk,
    isLoading,
    isLoaded,
    error,
    load,
    clearCache,
    isSupported,
  };
}

/**
 * 预定义的 SDK 加载器工厂
 * 统一管理所有 SDK 的加载配置
 */
export const sdkLoaders = {
  /**
   * HLS.js 加载器
   */
  hls: () =>
    useSdkLoader<typeof import('hls.js').default>({
      name: 'hls.js',
      importFn: () => import('hls.js').then((m) => m.default),
    }),

  /**
   * FLV.js 加载器
   */
  flv: () =>
    useSdkLoader<typeof import('flv.js').default>({
      name: 'flv.js',
      importFn: () => import('flv.js').then((m) => m.default),
    }),

  /**
   * DASH.js 加载器
   */
  dash: () =>
    useSdkLoader<typeof import('dashjs')>({
      name: 'dashjs',
      importFn: () => import('dashjs'),
    }),
};
