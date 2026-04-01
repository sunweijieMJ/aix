import type { App, Plugin } from 'vue';
import type { Router, RouteLocationNormalized } from 'vue-router';
import type {
  AutoPageviewConfig,
  BaseEventProperties,
  CommonPropertyMap,
  TrackerPluginOptions,
} from '../types.js';
import { TRACKER_INJECTION_KEY } from '../types.js';
import { Tracker } from '../core/tracker.js';
import { createTrackClickDirective } from '../directives/v-track-click.js';
import { createTrackExposureDirective } from '../directives/v-track-exposure.js';

/**
 * 创建 Tracker Vue 插件
 *
 * install() 内部依次：
 * 1. 创建 Tracker 实例
 * 2. app.provide() 注入到组件树
 * 3. 注册 v-track-click / v-track-exposure 自定义指令
 * 4. 如传入 router，安装 Router 守卫
 * 5. 异步调用 tracker.init() 初始化适配器
 */
export function createTrackerPlugin(options: TrackerPluginOptions): Plugin {
  return {
    install(app: App) {
      const tracker = new Tracker(options);

      // 1. 注入到组件树
      app.provide(TRACKER_INJECTION_KEY, tracker);

      // 2. 注册自定义指令
      app.directive('track-click', createTrackClickDirective(tracker));
      app.directive('track-exposure', createTrackExposureDirective(tracker));

      // 3. Router 集成
      if (options.router && options.autoPageview) {
        const config =
          typeof options.autoPageview === 'object' ? options.autoPageview : {};
        setupRouterGuard(tracker, options.router, config);
      }

      // 4. 异步初始化适配器（fire-and-forget，事件由 EventQueue 缓冲）
      tracker.init().catch((err) => {
        console.error('[kit-tracker] 初始化失败:', err);
      });
    },
  };
}

/** 安装 Router 守卫，自动上报 pageview / pageclose */
function setupRouterGuard(
  tracker: Tracker,
  router: Router,
  config: AutoPageviewConfig,
): void {
  let prevPageName = '';
  let prevEnterTime = 0;

  router.afterEach((to, from) => {
    // 排除检查
    if (shouldExclude(to, config.exclude)) return;

    // 解析页面名称
    const pageName = resolvePageName(to, config.getPageName);

    // 上报前一页 $pageclose（非首次导航时）
    if (prevPageName) {
      const duration = Date.now() - prevEnterTime;
      tracker.track('$pageclose', {
        page_name: prevPageName,
        dr: duration,
      });
    }

    // 更新公共属性中的页面信息
    if (prevPageName) {
      const fromProps: CommonPropertyMap = {
        global_from_page_name: prevPageName,
        global_from_page_url: from.fullPath,
      };
      tracker.setCommonData(fromProps);
    }
    const currentProps: CommonPropertyMap = {
      global_current_page_name: pageName,
      global_current_page_url: to.fullPath,
    };
    tracker.setCommonData(currentProps);

    // 上报 $pageview
    const pageviewProps: BaseEventProperties = {
      page_name: pageName,
      page_url: to.fullPath,
    };
    if (config.includeQuery && Object.keys(to.query).length > 0) {
      pageviewProps.page_query = JSON.stringify(to.query);
    }
    tracker.track('$pageview', pageviewProps);

    // 记录当前页信息
    prevPageName = pageName;
    prevEnterTime = Date.now();
  });
}

/** 检查路由是否应排除 */
function shouldExclude(
  to: RouteLocationNormalized,
  exclude?: (string | RegExp)[],
): boolean {
  if (!exclude || exclude.length === 0) return false;

  for (const rule of exclude) {
    if (typeof rule === 'string') {
      if (to.name === rule) return true;
    } else if (rule instanceof RegExp) {
      if (rule.test(to.path)) return true;
    }
  }
  return false;
}

/** 解析页面名称 */
function resolvePageName(
  to: RouteLocationNormalized,
  getPageName?: (to: RouteLocationNormalized) => string,
): string {
  if (getPageName) return getPageName(to);
  return (
    (to.meta?.title as string) ||
    (typeof to.name === 'string' ? to.name : '') ||
    to.path
  );
}
