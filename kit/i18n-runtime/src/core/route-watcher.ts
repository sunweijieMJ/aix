export interface RouteWatcher {
  start(onChange: () => void): void;
  stop(): void;
}

/** 只依赖 vue-router 里用得到的这一个方法，避免把整个 vue-router 类型定义硬耦合进来 */
export interface MinimalRouter {
  afterEach(cb: () => void): () => void;
}

/**
 * script 标签场景没有 router 实例可用，只能 monkey-patch history.pushState/replaceState
 * 并监听 popstate 来感知 SPA 路由切换。
 */
export function createHistoryPatchWatcher(): RouteWatcher {
  let originalPushState: typeof history.pushState | undefined;
  let originalReplaceState: typeof history.replaceState | undefined;
  let listener: (() => void) | undefined;

  return {
    start(onChange: () => void) {
      originalPushState = history.pushState;
      originalReplaceState = history.replaceState;

      history.pushState = function patchedPushState(...args) {
        const result = originalPushState!.apply(history, args);
        onChange();
        return result;
      };
      history.replaceState = function patchedReplaceState(...args) {
        const result = originalReplaceState!.apply(history, args);
        onChange();
        return result;
      };

      listener = onChange;
      window.addEventListener('popstate', listener);
    },
    stop() {
      if (originalPushState) history.pushState = originalPushState;
      if (originalReplaceState) history.replaceState = originalReplaceState;
      if (listener) window.removeEventListener('popstate', listener);
    },
  };
}

/** npm 插件场景传入了 router 实例，用官方 afterEach 钩子，比 monkey-patch 更干净 */
export function createRouterHookWatcher(router: MinimalRouter): RouteWatcher {
  let unsubscribe: (() => void) | undefined;

  return {
    start(onChange: () => void) {
      unsubscribe = router.afterEach(() => onChange());
    },
    stop() {
      unsubscribe?.();
    },
  };
}
