import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrap, parseConfigFromDataset } from '../../src/standalone/bootstrap.js';

function createScript(dataset: Record<string, string>): HTMLScriptElement {
  const script = document.createElement('script');
  for (const [key, value] of Object.entries(dataset)) {
    script.dataset[key] = value;
  }
  return script;
}

describe('parseConfigFromDataset', () => {
  it('应解析基础配置字段', () => {
    const config = parseConfigFromDataset({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: 'en,ja,ko',
      sourceLang: 'zh',
    } as DOMStringMap);

    expect(config).toMatchObject({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en', 'ja', 'ko'],
      sourceLang: 'zh',
    });
  });

  it('languages 应去除多余空格', () => {
    const config = parseConfigFromDataset({ languages: 'en, ja , ko' } as DOMStringMap);
    expect(config.languages).toEqual(['en', 'ja', 'ko']);
  });

  it('数字类配置项应从字符串转换成 number', () => {
    const config = parseConfigFromDataset({
      languages: 'en',
      debounceMs: '300',
      maxBatchSize: '20',
      maxEntries: '500',
    } as DOMStringMap);

    expect(config.debounceMs).toBe(300);
    expect(config.maxBatchSize).toBe(20);
    expect(config.maxEntries).toBe(500);
  });

  it('未传 languages 时应得到空数组（由 engine.start 的 fail-fast 校验负责报错）', () => {
    const config = parseConfigFromDataset({} as DOMStringMap);
    expect(config.languages).toEqual([]);
  });

  it('应解析 data-extra-attrs / data-glossary 为去空格去空项的数组', () => {
    const config = parseConfigFromDataset({
      languages: 'en',
      extraAttrs: 'data-placeholder, data-tip ,',
      glossary: 'AIX, ByteDance',
    } as DOMStringMap);

    expect(config.extraAttrs).toEqual(['data-placeholder', 'data-tip']);
    expect(config.glossary).toEqual(['AIX', 'ByteDance']);
  });

  it('未传 extraAttrs/glossary 时应为 undefined（走 engine 默认），空串也归一为 undefined', () => {
    const config = parseConfigFromDataset({ languages: 'en', glossary: ' , ' } as DOMStringMap);
    expect(config.extraAttrs).toBeUndefined();
    expect(config.glossary).toBeUndefined();
  });

  it('data-scan-shadow-dom 未传保持默认（undefined），显式 "false" 才关闭，其它值视为开启', () => {
    expect(
      parseConfigFromDataset({ languages: 'en' } as DOMStringMap).scanShadowDOM,
    ).toBeUndefined();
    expect(
      parseConfigFromDataset({ languages: 'en', scanShadowDom: 'false' } as DOMStringMap)
        .scanShadowDOM,
    ).toBe(false);
    expect(
      parseConfigFromDataset({ languages: 'en', scanShadowDom: 'true' } as DOMStringMap)
        .scanShadowDOM,
    ).toBe(true);
  });
});

describe('bootstrap', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    (window as unknown as Record<string, unknown>).__I18N_RUNTIME_STARTED__ = undefined;
    delete (window as unknown as Record<string, unknown>).I18nRuntime;
    vi.unstubAllGlobals();
  });

  it('应把 engine 挂到 window.I18nRuntime 上', () => {
    const script = createScript({ provider: 'backend', apiBase: '/api/i18n', languages: 'en' });
    const engine = bootstrap(script);

    expect((window as unknown as Record<string, unknown>).I18nRuntime).toBe(engine);
  });

  it('传了 data-initial-language 时应自动调用一次 setLanguage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { translations: [] } }),
      }),
    );
    const script = createScript({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: 'en',
      initialLanguage: 'en',
    });

    const engine = bootstrap(script);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(engine.getLanguage()).toBe('en');
  });

  it('未传 data-initial-language 时应保持显示原文', () => {
    const script = createScript({ provider: 'backend', apiBase: '/api/i18n', languages: 'en' });
    const engine = bootstrap(script);

    expect(engine.getLanguage()).toBe('zh');
  });

  it('script 标签被重复引入时，第二次 bootstrap 应复用真正在跑的第一个 engine，而不是暴露一个从未 start 成功的空壳', async () => {
    const script1 = createScript({ provider: 'backend', apiBase: '/api/i18n', languages: 'en' });
    const engine1 = bootstrap(script1);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const script2 = createScript({ provider: 'backend', apiBase: '/api/i18n', languages: 'ja' });
    const engine2 = bootstrap(script2);
    warnSpy.mockRestore();

    expect(engine2).toBe(engine1);
    expect((window as unknown as Record<string, unknown>).I18nRuntime).toBe(engine1);
    // 修复前：这里会因为 engine2 从未真正 start 而抛错
    await expect(engine2.setLanguage('en')).resolves.not.toThrow();
  });
});
