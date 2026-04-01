import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, inject } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTrackerPlugin } from '../../src/plugin/index.js';
import { TRACKER_INJECTION_KEY } from '../../src/types.js';
import { Tracker } from '../../src/core/tracker.js';
import type { ITrackerAdapter } from '../../src/types.js';

/** 创建 mock 适配器 */
function createMockAdapter(name = 'mock'): ITrackerAdapter {
  return {
    name,
    init: vi.fn().mockResolvedValue(undefined),
    track: vi.fn(),
    identify: vi.fn(),
    setCommonData: vi.fn(),
    isReady: vi.fn().mockReturnValue(true),
    destroy: vi.fn(),
  };
}

/** 创建测试用 Router */
function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: defineComponent({ render: () => h('div', '首页') }),
        meta: { title: '首页' },
      },
      {
        path: '/about',
        name: 'about',
        component: defineComponent({ render: () => h('div', '关于') }),
        meta: { title: '关于页' },
      },
      {
        path: '/login',
        name: 'login',
        component: defineComponent({ render: () => h('div', '登录') }),
      },
    ],
  });
}

describe('createTrackerPlugin', () => {
  it('应创建有效的 Vue 插件', () => {
    const plugin = createTrackerPlugin({
      appkey: 'test',
      adapters: [createMockAdapter()],
    });

    expect(plugin).toBeDefined();
    expect(plugin.install).toBeInstanceOf(Function);
  });

  it('install 后应通过 provide 注入 Tracker', () => {
    const adapter = createMockAdapter();
    const plugin = createTrackerPlugin({
      appkey: 'test',
      adapters: [adapter],
    });

    let injectedTracker: Tracker | undefined;
    const App = defineComponent({
      setup() {
        injectedTracker = inject(TRACKER_INJECTION_KEY);
        return () => h('div');
      },
    });

    const app = createApp(App);
    app.use(plugin);
    app.mount(document.createElement('div'));

    expect(injectedTracker).toBeInstanceOf(Tracker);
    app.unmount();
  });

  it('install 后应注册 v-track-click 和 v-track-exposure 指令', () => {
    const adapter = createMockAdapter();
    const plugin = createTrackerPlugin({
      appkey: 'test',
      adapters: [adapter],
    });

    const app = createApp(defineComponent({ render: () => h('div') }));
    const directiveSpy = vi.spyOn(app, 'directive');
    app.use(plugin);

    expect(directiveSpy).toHaveBeenCalledWith(
      'track-click',
      expect.any(Object),
    );
    expect(directiveSpy).toHaveBeenCalledWith(
      'track-exposure',
      expect.any(Object),
    );
    app.unmount();
  });

  it('应异步调用 tracker.init()', async () => {
    const adapter = createMockAdapter();
    createTrackerPlugin({
      appkey: 'test',
      adapters: [adapter],
    });

    const app = createApp(defineComponent({ render: () => h('div') }));
    app.use(
      createTrackerPlugin({
        appkey: 'test',
        adapters: [adapter],
      }),
    );
    app.mount(document.createElement('div'));

    // 等待异步 init
    await vi.waitFor(() => {
      expect(adapter.init).toHaveBeenCalled();
    });

    app.unmount();
  });
});

describe('Router Guard (autoPageview)', () => {
  let adapter: ITrackerAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it('autoPageview: true 时应在路由切换后上报 $pageview', async () => {
    const router = createTestRouter();
    const plugin = createTrackerPlugin({
      appkey: 'test',
      adapters: [adapter],
      router,
      autoPageview: true,
    });

    const app = createApp(defineComponent({ render: () => h('router-view') }));
    app.use(router);
    app.use(plugin);
    app.mount(document.createElement('div'));

    await router.isReady();
    // 首次导航到 /
    await router.push('/');

    expect(adapter.track).toHaveBeenCalledWith(
      '$pageview',
      expect.objectContaining({ page_name: '首页' }),
    );

    app.unmount();
  });

  it('路由切换应先上报前一页 $pageclose 再上报新页 $pageview', async () => {
    const router = createTestRouter();
    const plugin = createTrackerPlugin({
      appkey: 'test',
      adapters: [adapter],
      router,
      autoPageview: true,
    });

    const app = createApp(defineComponent({ render: () => h('router-view') }));
    app.use(router);
    app.use(plugin);
    app.mount(document.createElement('div'));

    await router.isReady();
    await router.push('/');
    (adapter.track as ReturnType<typeof vi.fn>).mockClear();

    await router.push('/about');

    const calls = (adapter.track as ReturnType<typeof vi.fn>).mock.calls;
    // 第一次调用应是 $pageclose（前一页）
    expect(calls?.[0]?.[0]).toBe('$pageclose');
    expect(calls?.[0]?.[1]).toEqual(
      expect.objectContaining({
        page_name: '首页',
        dr: expect.any(Number),
      }),
    );
    // 之后应有 $pageview（新页面）
    const pageviewCall = calls.find((c: unknown[]) => c[0] === '$pageview');
    expect(pageviewCall).toBeDefined();
    expect(pageviewCall![1]).toEqual(
      expect.objectContaining({ page_name: '关于页' }),
    );

    app.unmount();
  });

  it('exclude 配置应跳过匹配的路由', async () => {
    const router = createTestRouter();
    const plugin = createTrackerPlugin({
      appkey: 'test',
      adapters: [adapter],
      router,
      autoPageview: {
        exclude: ['login'],
      },
    });

    const app = createApp(defineComponent({ render: () => h('router-view') }));
    app.use(router);
    app.use(plugin);
    app.mount(document.createElement('div'));

    await router.isReady();
    await router.push('/login');

    // login 路由应被排除，不上报 $pageview
    const pageviewCalls = (
      adapter.track as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c: unknown[]) => c[0] === '$pageview');
    const loginPageview = pageviewCalls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).page_name === 'login',
    );
    expect(loginPageview).toBeUndefined();

    app.unmount();
  });

  it('exclude 正则应跳过匹配路径的路由', async () => {
    const router = createTestRouter();
    const plugin = createTrackerPlugin({
      appkey: 'test',
      adapters: [adapter],
      router,
      autoPageview: {
        exclude: [/^\/login/],
      },
    });

    const app = createApp(defineComponent({ render: () => h('router-view') }));
    app.use(router);
    app.use(plugin);
    app.mount(document.createElement('div'));

    await router.isReady();
    await router.push('/login');

    const pageviewCalls = (
      adapter.track as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c: unknown[]) => c[0] === '$pageview');
    const loginPageview = pageviewCalls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).page_url === '/login',
    );
    expect(loginPageview).toBeUndefined();

    app.unmount();
  });

  it('getPageName 配置应自定义页面名称', async () => {
    const router = createTestRouter();
    const plugin = createTrackerPlugin({
      appkey: 'test',
      adapters: [adapter],
      router,
      autoPageview: {
        getPageName: (to) => `custom_${String(to.name)}`,
      },
    });

    const app = createApp(defineComponent({ render: () => h('router-view') }));
    app.use(router);
    app.use(plugin);
    app.mount(document.createElement('div'));

    await router.isReady();
    await router.push('/about');

    expect(adapter.track).toHaveBeenCalledWith(
      '$pageview',
      expect.objectContaining({ page_name: 'custom_about' }),
    );

    app.unmount();
  });

  it('无 router 或 autoPageview 时不应安装守卫', () => {
    const plugin = createTrackerPlugin({
      appkey: 'test',
      adapters: [adapter],
    });

    const app = createApp(defineComponent({ render: () => h('div') }));
    app.use(plugin);
    app.mount(document.createElement('div'));

    // 无路由相关调用
    expect(adapter.track).not.toHaveBeenCalledWith(
      '$pageview',
      expect.anything(),
    );
    app.unmount();
  });
});
