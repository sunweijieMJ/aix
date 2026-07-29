import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine, getActiveEngine } from '../../src/core/engine.js';

describe('createEngine', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p>你好</p>';
    (window as any).__I18N_RUNTIME_STARTED__ = undefined;
  });

  afterEach(() => {
    // 用例中途断言失败时，写在用例末尾的 engine.stop() 不会执行，残留 engine 会继续用
    // MutationObserver 观察 document.body，把自己 L1 里的旧译文写进下一个用例刚建好的 DOM
    getActiveEngine()?.stop();
    // 同理放在 afterEach 而不是各用例末尾：fake timers 泄漏会让下一个依赖真实定时器的
    // 用例直接超时，排查成本很高
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    // localStorage 是 jsdom 提供的真实全局对象，不会随 vi.restoreAllMocks 重置，
    // 不清理会导致后面用相同原文的用例命中前一个用例写入的语言包缓存，绕过 mock 的 fetch
    localStorage.clear();
  });

  it('start() 时 provider 为 backend 却未传 apiBase 应立即抛错（fail-fast）', () => {
    const engine = createEngine();
    expect(() => engine.start({ provider: 'backend', languages: ['en'] })).toThrow('apiBase');
  });

  it('start() 时 provider 传入不认识的值应立即抛错（否则会静默降级成另一个 provider 打空请求）', () => {
    const engine = createEngine();
    expect(() => engine.start({ provider: 'sometranslator' as never, languages: ['en'] })).toThrow(
      'provider',
    );
  });

  it('start() 时 fallbackProvider 传入不认识的值应立即抛错', () => {
    const engine = createEngine();
    expect(() =>
      engine.start({
        provider: 'backend',
        apiBase: '/api/i18n',
        fallbackProvider: 'sometranslator' as never,
        languages: ['en'],
      }),
    ).toThrow('fallbackProvider');
  });

  it('start() 时 languages 为空数组应立即抛错', () => {
    const engine = createEngine();
    expect(() =>
      engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: [] }),
    ).toThrow('languages');
  });

  it('start() 后未调用 setLanguage 之前不应发起任何网络请求', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });

    expect(fetchMock).not.toHaveBeenCalled();
    engine.stop();
  });

  it('未调用 start() 直接 setLanguage 应抛错', async () => {
    const engine = createEngine();
    await expect(engine.setLanguage('en')).rejects.toThrow('start()');
  });

  it('setLanguage 传入不在 languages 里的语言应抛错', async () => {
    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });
    await expect(engine.setLanguage('fr')).rejects.toThrow('fr');
    engine.stop();
  });

  it('setLanguage 应翻译页面文本并写回 DOM，getLanguage 应返回新语言', async () => {
    // scanFull() 内部依赖 requestIdleCallback（jsdom 不支持，降级 setTimeout(0)）+
    // 攒批 debounce（默认 200ms）两层真实定时器，setLanguage() 本身不等待这条流水线跑完
    // 就 resolve（fire-and-forget，符合"允许短暂闪过原文再变译文"的设计），
    // 所以断言前必须用 fake timers 把这些定时器推进完，否则会读到还没被替换的原文。
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/pack')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
        });
      }
      const body = JSON.parse(init!.body as string) as {
        items: Array<{ hash: string; text: string }>;
      };
      return Promise.resolve({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            translations: body.items.map((item) => ({ hash: item.hash, translation: 'hello' })),
          },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);

    expect(engine.getLanguage()).toBe('en');
    expect(document.body.querySelector('p')!.textContent).toBe('hello');
    engine.stop();
    vi.useRealTimers();
  });

  it('terminology 命中时应直接写回固定译文，不请求翻译接口（pack 拉取仍正常发生）', async () => {
    vi.useFakeTimers();
    const translateMock = vi.fn();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/pack')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
        });
      }
      translateMock(init);
      return Promise.resolve({
        ok: true,
        json: async () => ({ code: 0, data: { translations: [] } }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = createEngine();
    engine.start({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en'],
      terminology: { 你好: { en: 'Fixed Hello' } },
    });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);

    expect(document.body.querySelector('p')!.textContent).toBe('Fixed Hello');
    expect(translateMock).not.toHaveBeenCalled(); // 唯一的候选被 terminology 短路，不应触发 /translate
    engine.stop();
    vi.useRealTimers();
  });

  it('业务改写已翻译节点后重新翻译，registry 记录的 originalText 应跟着更新为新内容，切换语言时不会用旧原文重新翻译', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/pack')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
        });
      }
      const body = JSON.parse(init!.body as string) as {
        items: Array<{ hash: string; text: string }>;
        targetLang: string;
      };
      return Promise.resolve({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            translations: body.items.map((item) => ({
              hash: item.hash,
              translation: `[${body.targetLang}]${item.text}`,
            })),
          },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en', 'ja'] });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);
    expect(document.body.querySelector('p')!.textContent).toBe('[en]你好');

    document.body.querySelector('p')!.textContent = '新公告'; // 业务改写了已翻译节点的内容
    await vi.advanceTimersByTimeAsync(500);
    expect(document.body.querySelector('p')!.textContent).toBe('[en]新公告');

    await engine.setLanguage('ja');
    await vi.advanceTimersByTimeAsync(500);
    // originalText 若没有正确更新为"新公告"，这里会错误地把旧原文"你好"翻译成日语
    expect(document.body.querySelector('p')!.textContent).toBe('[ja]新公告');

    engine.stop();
    vi.useRealTimers();
  });

  it('翻译请求失败时不应抛出未捕获异常，候选会在下次扫描时自动重试成功', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/pack')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
        });
      }
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 502 });
      }
      const body = JSON.parse(init!.body as string) as {
        items: Array<{ hash: string; text: string }>;
      };
      return Promise.resolve({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            translations: body.items.map((item) => ({ hash: item.hash, translation: 'hello' })),
          },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);

    // 第一次翻译请求失败：页面保持原文，失败被记录日志而不是抛出未捕获异常
    expect(document.body.querySelector('p')!.textContent).toBe('你好');
    expect(errorSpy).toHaveBeenCalled();

    // 再次触发扫描（模拟路由切换/下次全量扫描）：失败的候选没有被记录进 registry，会自然重新入队重试
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);

    expect(document.body.querySelector('p')!.textContent).toBe('hello');

    engine.stop();
    vi.useRealTimers();
  });

  it('同一批候选里，未缓存部分翻译失败不应连累已缓存部分的正常写回', async () => {
    vi.useFakeTimers();
    let translateCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/pack')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
        });
      }
      translateCallCount += 1;
      if (translateCallCount === 2) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      const body = JSON.parse(init!.body as string) as {
        items: Array<{ hash: string; text: string }>;
      };
      return Promise.resolve({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            translations: body.items.map((item) => ({ hash: item.hash, translation: 'hello' })),
          },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);
    expect(document.body.querySelector('p')!.textContent).toBe('hello');

    // 同一个 mutation 批次里新增两个节点：一个内容跟已翻译过的"你好"相同（应命中缓存，
    // 不需要网络请求），一个是全新内容"再见"（未缓存，这次翻译请求会失败）
    const container = document.createElement('div');
    const cachedHitEl = document.createElement('p');
    cachedHitEl.textContent = '你好';
    const newTextEl = document.createElement('span');
    newTextEl.textContent = '再见';
    container.appendChild(cachedHitEl);
    container.appendChild(newTextEl);
    document.body.appendChild(container);

    await vi.advanceTimersByTimeAsync(500);

    // "再见"翻译失败，保持原文，等待下次扫描重试（预期行为）
    expect(newTextEl.textContent).toBe('再见');
    // "你好"命中缓存，不应该被同批次里"再见"的翻译失败连累，应该正常写回译文
    expect(cachedHitEl.textContent).toBe('hello');

    engine.stop();
    vi.useRealTimers();
  });

  it('重复调用 start() 应被幂等忽略并打印 warn，不重新装配', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine1 = createEngine();
    engine1.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });

    const engine2 = createEngine();
    engine2.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['ja'] });

    expect(warnSpy).toHaveBeenCalledOnce();
    engine1.stop();
  });

  it('getActiveEngine() 在重复 start() 场景下应返回真正启动成功的那个 engine，而不是被 guard 拦截的空壳', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine1 = createEngine();
    engine1.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });

    const engine2 = createEngine();
    engine2.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['ja'] });

    // 被 guard 拦截的 engine2 从未真正 start，调用 setLanguage 应该抛错
    await expect(engine2.setLanguage('ja')).rejects.toThrow('start()');

    // 而 getActiveEngine() 应该拿到真正在跑的 engine1，可以正常 setLanguage
    expect(getActiveEngine()).toBe(engine1);
    await expect(getActiveEngine()!.setLanguage('en')).resolves.not.toThrow();

    engine1.stop();
    expect(getActiveEngine()).toBeUndefined();
  });

  it('翻译没有 value 属性的 <option> 时应把原文固化进 value，显示译文但表单提交值不变', async () => {
    // <option> 未显式声明 value 时，表单提交值取自它的文本内容，
    // 直接改文本会连带改掉提交值——但 option 文本本身是必须翻译的展示文案，不能像
    // textarea 那样整体跳过，只能在写回前把原值固化下来
    vi.useFakeTimers();
    document.body.innerHTML = `<select><option>中文选项</option><option value="fixed">固定值</option></select>`;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/pack')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
          });
        }
        const body = JSON.parse(init!.body as string) as {
          items: Array<{ hash: string; text: string }>;
        };
        return Promise.resolve({
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              translations: body.items.map((item) => ({
                hash: item.hash,
                translation: `EN(${item.text})`,
              })),
            },
          }),
        });
      }),
    );

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);

    const options = document.querySelectorAll('option');
    expect(options[0]!.textContent).toBe('EN(中文选项)'); // 显示层照常翻译
    expect(options[0]!.value).toBe('中文选项'); // 提交值必须保持原文
    expect(options[1]!.textContent).toBe('EN(固定值)');
    expect(options[1]!.value).toBe('fixed'); // 本来就有 value 的不受影响

    engine.stop();
  });

  it('provider 返回空字符串译文时不应写回 DOM，页面应保持原文', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p>你好</p><input placeholder="请输入" />';
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/pack')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
        });
      }
      const body = JSON.parse(init!.body as string) as {
        items: Array<{ hash: string; text: string }>;
      };
      return Promise.resolve({
        ok: true,
        json: async () => ({
          code: 0,
          // 机翻引擎对某些输入会返回空串（纯符号/超长截断/后端异常），
          // 空串被当成有效译文写回等于把页面内容抹掉
          data: { translations: body.items.map((item) => ({ hash: item.hash, translation: '' })) },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);

    expect(document.body.querySelector('p')!.textContent).toBe('你好');
    expect(document.body.querySelector('input')!.getAttribute('placeholder')).toBe('请输入');

    engine.stop();
    vi.useRealTimers();
  });

  it('stop() 之后在途翻译请求返回不应再改写 DOM', async () => {
    let resolveTranslate: () => void = () => {};
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/pack')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
        });
      }
      const body = JSON.parse(init!.body as string) as {
        items: Array<{ hash: string; text: string }>;
      };
      // 翻译请求悬挂，直到测试在 stop() 之后手动放行，模拟"请求在途时业务卸载了运行时"
      return new Promise((resolve) => {
        resolveTranslate = () =>
          resolve({
            ok: true,
            json: async () => ({
              code: 0,
              data: {
                translations: body.items.map((item) => ({ hash: item.hash, translation: 'hello' })),
              },
            }),
          });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });
    await engine.setLanguage('en');
    // 必须等到翻译请求真的发出（scanFull 的 rAF + 攒批 debounce 都跑完、候选已出队）才能
    // stop()，否则 disconnect() 清空的是还没出队的队列，根本走不到"await 之后仍写 DOM"那条路径
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/translate'))).toBe(true),
    );

    engine.stop();
    resolveTranslate();
    await new Promise((r) => setTimeout(r, 50));

    expect(document.body.querySelector('p')!.textContent).toBe('你好');
  });

  it('stop() 后立刻重新 start()，上一轮的在途翻译批次不应写回 DOM', async () => {
    // React StrictMode 的 unmount/remount 就是这个时序：只判断 started 布尔值不够，
    // 重启后它又是 true，旧批次会当成"运行中"继续写回（译文还会经由闭包写进新的 packStore）
    let release: () => void = () => {};
    const translateFetcher = vi.fn().mockImplementation(
      (req: { items: Array<{ hash: string; text: string }> }) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              translations: req.items.map((item) => ({ hash: item.hash, translation: 'hello' })),
            });
        }),
    );
    const config = {
      provider: 'backend' as const,
      apiBase: '/api/i18n',
      languages: ['en'],
      backendOptions: { packFetcher: async () => null, translateFetcher },
    };

    const engine = createEngine();
    engine.start(config);
    await engine.setLanguage('en');
    await vi.waitFor(() => expect(translateFetcher).toHaveBeenCalled());

    engine.stop();
    engine.start(config); // 立刻重启，此时 started 又变回 true
    release();
    await new Promise((r) => setTimeout(r, 50));

    expect(document.body.querySelector('p')!.textContent).toBe('你好');
    engine.stop();
  });

  it('切换语言后，上一个语言的在途批次不应再写回 DOM（否则会闪一下旧语言的译文）', async () => {
    vi.useFakeTimers();
    let releaseEn: (() => void) | undefined;
    const enGate = new Promise<void>((resolve) => {
      releaseEn = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/pack')) {
          return {
            ok: true,
            json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
          };
        }
        const body = JSON.parse(init!.body as string) as {
          items: Array<{ hash: string; text: string }>;
          targetLang: string;
        };
        if (body.targetLang === 'en') await enGate; // en 批次一直挂起，直到用例主动放行
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              translations: body.items.map((item) => ({
                hash: item.hash,
                translation: `[${body.targetLang}]${item.text}`,
              })),
            },
          }),
        };
      }),
    );

    const engine = createEngine();
    const writes: string[] = [];
    engine.on('node-translated', (node) => writes.push(node.textContent ?? ''));
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en', 'ja'] });

    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500); // en 批次已发出并挂起，尚未写回
    await engine.setLanguage('ja');
    await vi.advanceTimersByTimeAsync(500); // ja 批次正常完成写回
    expect(writes).toEqual(['[ja]你好']);

    releaseEn!();
    await vi.advanceTimersByTimeAsync(500);
    // 未修复时这里是 ['[ja]你好', '[en]你好', '[ja]你好']——旧语言先覆盖一次，再靠
    // MutationObserver + L1 缓存自愈回来，最终态虽然对，但用户能看到一次明显闪烁
    expect(writes).toEqual(['[ja]你好']);
    expect(document.body.querySelector('p')!.textContent).toBe('[ja]你好');

    engine.stop();
    vi.useRealTimers();
  });

  it('目标语言等于源语言时应本地还原原文，不发起翻译请求', async () => {
    vi.useFakeTimers();
    const translateTargets: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/pack')) {
          return {
            ok: true,
            json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
          };
        }
        const body = JSON.parse(init!.body as string) as {
          items: Array<{ hash: string; text: string }>;
          targetLang: string;
        };
        translateTargets.push(body.targetLang);
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              translations: body.items.map((item) => ({
                hash: item.hash,
                translation: `[${body.targetLang}]${item.text}`,
              })),
            },
          }),
        };
      }),
    );

    document.body.innerHTML = '<p>你好</p><input placeholder="请输入姓名">';
    const engine = createEngine();
    engine.start({
      provider: 'backend',
      apiBase: '/api/i18n',
      sourceLang: 'zh',
      languages: ['zh', 'en'],
    });

    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);
    expect(document.body.querySelector('p')!.textContent).toBe('[en]你好');
    expect(document.body.querySelector('input')!.getAttribute('placeholder')).toBe(
      '[en]请输入姓名',
    );
    expect(translateTargets).toEqual(['en']);

    await engine.setLanguage('zh');
    await vi.advanceTimersByTimeAsync(500);
    // 原文在 registry / data-i18n-orig-* 里都有，还原不需要经过翻译服务；
    // 未修复时这里会打一次 zh -> zh 请求，页面文案变成后端返回的任意值而不是原文
    expect(translateTargets).toEqual(['en']);
    expect(document.body.querySelector('p')!.textContent).toBe('你好');
    expect(document.body.querySelector('input')!.getAttribute('placeholder')).toBe('请输入姓名');

    // 还原之后再切回目标语言仍要能正常翻译（原文记录没有被还原动作污染成译文）
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);
    expect(document.body.querySelector('p')!.textContent).toBe('[en]你好');
    expect(document.body.querySelector('input')!.getAttribute('placeholder')).toBe(
      '[en]请输入姓名',
    );

    engine.stop();
    vi.useRealTimers();
  });

  it('shouldTranslate 返回 false 的文本和属性都不应发给翻译服务，也不应被改写', async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/pack')) {
          return {
            ok: true,
            json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
          };
        }
        const body = JSON.parse(init!.body as string) as {
          items: Array<{ hash: string; text: string }>;
        };
        for (const item of body.items) sent.push(item.text);
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              translations: body.items.map((item) => ({
                hash: item.hash,
                translation: `[en]${item.text}`,
              })),
            },
          }),
        };
      }),
    );

    document.body.innerHTML =
      '<p>普通文案</p><p>联系 zhangwei@example.com</p>' +
      '<input placeholder="请输入姓名" title="工单 zhangwei@example.com">';
    const seenNodes: Node[] = [];
    const engine = createEngine();
    engine.start({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en'],
      shouldTranslate: (text, node) => {
        seenNodes.push(node);
        return !text.includes('@');
      },
    });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);

    // 含个人信息的文本压根没有出网
    expect(sent).toEqual(['普通文案', '请输入姓名']);
    expect(document.body.querySelectorAll('p')[1]!.textContent).toBe('联系 zhangwei@example.com');
    expect(document.body.querySelector('input')!.getAttribute('title')).toBe(
      '工单 zhangwei@example.com',
    );
    // 未被拦截的内容照常翻译
    expect(document.body.querySelectorAll('p')[0]!.textContent).toBe('[en]普通文案');
    expect(document.body.querySelector('input')!.getAttribute('placeholder')).toBe(
      '[en]请输入姓名',
    );
    // 文本候选回调收到 Text 节点，属性候选回调收到属性所在的 Element
    expect(seenNodes.some((node) => node.nodeType === Node.TEXT_NODE)).toBe(true);
    expect(seenNodes.some((node) => node.nodeType === Node.ELEMENT_NODE)).toBe(true);

    engine.stop();
    vi.useRealTimers();
  });

  it('clearCache 应同时清空 L1 内存与 L2 持久化缓存', async () => {
    vi.useFakeTimers();
    let translateCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/pack')) {
          return {
            ok: true,
            json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
          };
        }
        translateCalls += 1;
        const body = JSON.parse(init!.body as string) as {
          items: Array<{ hash: string; text: string }>;
        };
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              translations: body.items.map((item) => ({
                hash: item.hash,
                translation: `[en]${item.text}`,
              })),
            },
          }),
        };
      }),
    );

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);
    expect(translateCalls).toBe(1);
    expect(localStorage.getItem('i18n-pack:en')).not.toBeNull();

    // 用户登出等场景：缓存里可能留着含个人信息的译文，必须能主动清掉
    await engine.clearCache('en');
    expect(localStorage.getItem('i18n-pack:en')).toBeNull();

    // L1 也清了：同样的原文重新出现时必须重新走翻译，而不是命中残留的内存缓存
    const fresh = document.createElement('p');
    fresh.textContent = '你好';
    document.body.appendChild(fresh);
    await vi.advanceTimersByTimeAsync(500);
    expect(translateCalls).toBe(2);

    engine.stop();
    vi.useRealTimers();
  });

  it('clearCache 在 storage adapter 未实现 clear() 时不应抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
      }),
    );

    const engine = createEngine();
    engine.start({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en'],
      // clear 是 PackStorageAdapter 上的可选方法，自定义 adapter 可以不实现
      storage: { get: async () => null, set: async () => {} },
    });
    await expect(engine.clearCache()).resolves.not.toThrow();
    engine.stop();
  });

  it('本地缓存不可用（隐私模式禁用 storage）时仍应正常翻译页面', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/pack')) {
          return {
            ok: true,
            json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
          };
        }
        const body = JSON.parse(init!.body as string) as {
          items: Array<{ hash: string; text: string }>;
        };
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              translations: body.items.map((item) => ({
                hash: item.hash,
                translation: `[en]${item.text}`,
              })),
            },
          }),
        };
      }),
    );

    // L2 完全不可用：读写都抛（IndexedDB 被隐私模式/企业策略禁用时就是这个表现）
    const brokenStorage = {
      get: async (): Promise<never> => {
        throw new DOMException('storage 不可用');
      },
      set: async (): Promise<never> => {
        throw new DOMException('storage 不可用');
      },
    };

    const engine = createEngine();
    engine.start({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en'],
      storage: brokenStorage,
    });
    // L2 只是缓存、L3 才是权威源，L2 挂掉不该让 setLanguage 整体失败——
    // 未修复时这里会 reject，后面的 scanFull 根本不执行，全站保持原文
    await expect(engine.setLanguage('en')).resolves.not.toThrow();
    await vi.advanceTimersByTimeAsync(500);
    expect(document.body.querySelector('p')!.textContent).toBe('[en]你好');

    engine.stop();
    vi.useRealTimers();
  });

  it('源语言不在 languages 里时也应允许 setLanguage(sourceLang) 还原原文', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/pack')) {
          return {
            ok: true,
            json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
          };
        }
        const body = JSON.parse(init!.body as string) as {
          items: Array<{ hash: string; text: string }>;
        };
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              translations: body.items.map((item) => ({
                hash: item.hash,
                translation: `[en]${item.text}`,
              })),
            },
          }),
        };
      }),
    );

    const engine = createEngine();
    // languages 是"目标语言列表"，业务通常不会把页面原文语言也列进去；
    // 若还原路径要求源语言必须出现在 languages 里，这条路径实际上就永远走不到
    engine.start({
      provider: 'backend',
      apiBase: '/api/i18n',
      sourceLang: 'zh',
      languages: ['en'],
    });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);
    expect(document.body.querySelector('p')!.textContent).toBe('[en]你好');

    await expect(engine.setLanguage('zh')).resolves.not.toThrow();
    await vi.advanceTimersByTimeAsync(500);
    expect(document.body.querySelector('p')!.textContent).toBe('你好');
    expect(engine.getLanguage()).toBe('zh');

    // 不认识的语言仍然要拒绝
    await expect(engine.setLanguage('fr')).rejects.toThrow('fr');

    engine.stop();
    vi.useRealTimers();
  });

  it('语言包是按语言的全量映射，/pack 请求不应携带 path；/translate 仍应携带 path', async () => {
    vi.useFakeTimers();
    const packUrls: string[] = [];
    const translatePaths: Array<string | undefined> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/pack')) {
          packUrls.push(url);
          return {
            ok: true,
            json: async () => ({ code: 0, data: { version: 'v1', entries: {} } }),
          };
        }
        const body = JSON.parse(init!.body as string) as {
          items: Array<{ hash: string; text: string }>;
          path?: string;
        };
        translatePaths.push(body.path);
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: {
              translations: body.items.map((item) => ({ hash: item.hash, translation: 'hello' })),
            },
          }),
        };
      }),
    );

    const engine = createEngine();
    engine.start({
      provider: 'backend',
      apiBase: '/api/i18n',
      languages: ['en'],
      getCurrentPath: () => '/dashboard',
    });
    await engine.setLanguage('en');
    await vi.advanceTimersByTimeAsync(500);

    expect(packUrls.length).toBeGreaterThan(0);
    // L2 按 lang 存储、version 也按 lang 比对，一旦后端真的按 path 返回子集，
    // 第二个页面的整包会因为 version 相同被静默丢弃
    expect(packUrls.every((url) => !url.includes('path='))).toBe(true);
    expect(translatePaths).toEqual(['/dashboard']);

    engine.stop();
    vi.useRealTimers();
  });

  it('stop() 后 setLanguage 触发的 scanFull 不应再通过 routeWatcher 响应路由切换', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { translations: [] } }),
      }),
    );

    const engine = createEngine();
    engine.start({ provider: 'backend', apiBase: '/api/i18n', languages: ['en'] });
    await engine.setLanguage('en');
    engine.stop();

    // stop 后触发路由切换不应抛错（history.pushState 应已恢复成原始实现）
    expect(() => history.pushState({}, '', '/after-stop')).not.toThrow();
  });
});
