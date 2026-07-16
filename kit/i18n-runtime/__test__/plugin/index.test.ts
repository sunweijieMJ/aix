import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import type { I18nRuntimeEngine } from '../../src/core/engine.js';
import { createI18nRuntimePlugin, useI18nRuntime } from '../../src/plugin/index.js';

/** 挂载一个用 useI18nRuntime() 取出 engine 实例的子组件，避免依赖 Vue 内部 _context.provides */
function mountWithPlugin(options: Parameters<typeof createI18nRuntimePlugin>[0]) {
  let engine!: I18nRuntimeEngine;
  const Child = {
    setup() {
      engine = useI18nRuntime();
      return () => null;
    },
  };

  const app = createApp(Child);
  app.use(createI18nRuntimePlugin(options));
  const el = document.createElement('div');
  app.mount(el);

  return { app, getEngine: () => engine };
}

describe('createI18nRuntimePlugin', () => {
  beforeEach(() => {
    // engine 的重复启动保护走 window 全局标记，每个用例需要重置，否则只有第一个用例真正 start()
    (window as unknown as Record<string, unknown>).__I18N_RUNTIME_STARTED__ = undefined;
  });

  it('install 时应调用 engine.start()，未传 initialLanguage 时保持显示原文', () => {
    document.body.innerHTML = '';
    const { app, getEngine } = mountWithPlugin({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en'],
    });

    expect(getEngine().getLanguage()).toBe('zh');
    app.unmount();
  });

  it('传入 initialLanguage 时应在 install 后自动调用一次 setLanguage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { translations: [] } }),
      }),
    );
    document.body.innerHTML = '<p>你好</p>';

    const { app, getEngine } = mountWithPlugin({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en'],
      initialLanguage: 'en',
    });

    // setLanguage 是 install() 内部 fire-and-forget 调用的异步操作，等一个微任务
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getEngine().getLanguage()).toBe('en');
    app.unmount();
    vi.unstubAllGlobals();
  });

  it('未挂在 plugin 下时 useI18nRuntime() 应抛错', () => {
    const Child = {
      setup() {
        expect(() => useI18nRuntime()).toThrow('useI18nRuntime');
        return () => null;
      },
    };
    const app = createApp(Child);
    const el = document.createElement('div');
    app.mount(el);
    app.unmount();
  });

  it('router 未传入时插件应能正常 install，不抛错（沿用 history-patch 策略，行为由 Task 8/9 保证）', () => {
    document.body.innerHTML = '';
    const { app } = mountWithPlugin({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en'],
    });
    app.unmount();
  });

  it('app.use(plugin) 被重复调用时，第二次 install 应复用真正在跑的第一个 engine', () => {
    document.body.innerHTML = '';
    const { app: app1, getEngine: getEngine1 } = mountWithPlugin({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en'],
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app: app2, getEngine: getEngine2 } = mountWithPlugin({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['ja'],
    });
    warnSpy.mockRestore();

    // 修复前：这里会拿到一个从未真正 start 成功的空壳 engine
    expect(getEngine2()).toBe(getEngine1());

    app1.unmount();
    app2.unmount();
  });
});
