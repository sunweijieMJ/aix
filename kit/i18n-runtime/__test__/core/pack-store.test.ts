import { describe, expect, it, vi } from 'vitest';
import { PackStore } from '../../src/core/pack-store.js';
import type { PackData, PackStorageAdapter, RemotePack } from '../../src/types.js';

function createMemoryStorage(): PackStorageAdapter & { data: Map<string, PackData> } {
  const data = new Map<string, PackData>();
  return {
    data,
    async get(lang) {
      return data.get(lang) ?? null;
    },
    async set(lang, value) {
      data.set(lang, value);
    },
  };
}

describe('PackStore', () => {
  it('hydrate 后应能从 L2 缓存读取到已有词条', async () => {
    const storage = createMemoryStorage();
    storage.data.set('en', {
      version: 'v1',
      entries: { abc: { translation: 'hello', lastUsedAt: 1 } },
    });
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockResolvedValue({
        version: 'v1',
        entries: { abc: 'hello' },
      });

    const store = new PackStore({ storage, fetchRemotePack });
    await store.hydrate('en');

    expect(store.get('en', 'abc')).toBe('hello');
  });

  it('L3 version 与 L2 不同时应整包替换并回写 L2', async () => {
    const storage = createMemoryStorage();
    storage.data.set('en', {
      version: 'v1',
      entries: { abc: { translation: 'old', lastUsedAt: 1 } },
    });
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockResolvedValue({
        version: 'v2',
        entries: { abc: 'new', def: 'brand-new' },
      });

    const store = new PackStore({ storage, fetchRemotePack });
    await store.hydrate('en');

    expect(store.get('en', 'abc')).toBe('new');
    expect(store.get('en', 'def')).toBe('brand-new');
    expect(storage.data.get('en')!.version).toBe('v2');
  });

  it('L3 拉取失败时应静默降级，L2 数据仍可用', async () => {
    const storage = createMemoryStorage();
    storage.data.set('en', {
      version: 'v1',
      entries: { abc: { translation: 'hello', lastUsedAt: 1 } },
    });
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockRejectedValue(new Error('network error'));

    const store = new PackStore({ storage, fetchRemotePack });
    await expect(store.hydrate('en')).resolves.not.toThrow();

    expect(store.get('en', 'abc')).toBe('hello');
  });

  it('clear 应同时移除 L1 内存与 L2 持久化数据', async () => {
    const data = new Map<string, PackData>();
    const storage: PackStorageAdapter = {
      get: async (lang) => data.get(lang) ?? null,
      set: async (lang, value) => {
        data.set(lang, value);
      },
      clear: async (lang) => {
        data.delete(lang);
      },
    };
    const store = new PackStore({ storage, fetchRemotePack: async () => null });
    await store.setMany('en', { abc: 'hello' });
    expect(store.get('en', 'abc')).toBe('hello');

    await store.clear('en');

    expect(store.get('en', 'abc')).toBeUndefined();
    expect(await storage.get('en')).toBeNull();
  });

  it('clear 遇到未实现 clear() 的 adapter 时仍应清掉 L1，且不抛错', async () => {
    const storage: PackStorageAdapter = { get: async () => null, set: async () => {} };
    const store = new PackStore({ storage, fetchRemotePack: async () => null });
    await store.setMany('en', { abc: 'hello' });

    await expect(store.clear('en')).resolves.not.toThrow();
    expect(store.get('en', 'abc')).toBeUndefined();
  });

  it('L2 读取抛错时 hydrate 不应失败，应降级为仅使用远端语言包', async () => {
    // IndexedDB 在隐私模式/被企业策略禁用时 open 就会抛，localStorage 在部分浏览器的
    // 无痕模式下 getItem 也会抛。L2 只是缓存不是权威源，它挂掉不该让整个翻译流程停摆
    const storage: PackStorageAdapter = {
      get: async () => {
        throw new DOMException('storage 不可用');
      },
      set: async () => {},
    };
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockResolvedValue({ version: 'v1', entries: { abc: 'hello' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = new PackStore({ storage, fetchRemotePack });
    await expect(store.hydrate('en')).resolves.not.toThrow();

    expect(store.get('en', 'abc')).toBe('hello');
  });

  it('L2 写入抛错时 setMany 不应失败，L1 仍应保留译文', async () => {
    const storage: PackStorageAdapter = {
      get: async () => null,
      set: async () => {
        throw new DOMException('storage 不可用');
      },
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = new PackStore({ storage, fetchRemotePack: async () => null });
    await expect(store.setMany('en', { abc: 'hello' })).resolves.not.toThrow();

    expect(store.get('en', 'abc')).toBe('hello');
  });

  it('setMany 写入后应立即可通过 get 读取，并持久化到 L2', async () => {
    const storage = createMemoryStorage();
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockResolvedValue(null);

    const store = new PackStore({ storage, fetchRemotePack });
    await store.setMany('en', { abc: 'hello', def: 'world' });

    expect(store.get('en', 'abc')).toBe('hello');
    expect(store.get('en', 'def')).toBe('world');

    const persisted = await storage.get('en');
    expect(persisted!.entries.abc!.translation).toBe('hello');
  });

  it('hydrate 拉取 L3 期间发生的并发 setMany 写入不应该被整体替换丢弃', async () => {
    const storage = createMemoryStorage();
    storage.data.set('en', {
      version: 'v1',
      entries: { abc: { translation: 'old', lastUsedAt: 1 } },
    });

    const store: PackStore = new PackStore({
      storage,
      fetchRemotePack: async () => {
        // 模拟 L3 网络请求还没返回时，另一批翻译结果已经通过 setMany 并发写入了同一个 lang
        await store.setMany('en', { xyz: 'concurrent-value' });
        return { version: 'v2', entries: { abc: 'new' } };
      },
    });

    await store.hydrate('en');

    expect(store.get('en', 'abc')).toBe('new'); // L3 权威数据应该生效
    expect(store.get('en', 'xyz')).toBe('concurrent-value'); // 并发写入不应该被整体替换丢弃
  });

  it('并发 setMany 写入同一语言时，L2 持久化不应互相用旧快照覆盖丢失对方的词条', async () => {
    const data = new Map<string, PackData>();
    // 用真正异步（多一跳微任务）的 storage 更贴近 localStorage/IndexedDB 的实际时序，
    // 制造出两次 setMany 的"读旧数据 -> 合并 -> 写回"临界区互相交叠的窗口
    const storage: PackStorageAdapter = {
      async get(lang) {
        await Promise.resolve();
        return data.get(lang) ?? null;
      },
      async set(lang, value) {
        await Promise.resolve();
        data.set(lang, value);
      },
    };
    const store = new PackStore({ storage, fetchRemotePack: async () => null });

    await Promise.all([
      store.setMany('en', { hashA: 'valueA' }),
      store.setMany('en', { hashB: 'valueB' }),
    ]);

    // 内存层（L1，运行时 get() 的数据源）不应该丢
    expect(store.get('en', 'hashA')).toBe('valueA');
    expect(store.get('en', 'hashB')).toBe('valueB');

    // 持久化层（L2）在并发读改写下也不应该丢——这是本用例要防止回归的点
    const persisted = await storage.get('en');
    expect(persisted!.entries.hashA?.translation).toBe('valueA');
    expect(persisted!.entries.hashB?.translation).toBe('valueB');
  });

  it('hydrate 拉取 L3 期间发生的并发 setMany 写入，L2 持久化也不应该被整体替换丢弃', async () => {
    const storage = createMemoryStorage();
    storage.data.set('en', {
      version: 'v1',
      entries: { abc: { translation: 'old', lastUsedAt: 1 } },
    });

    const store: PackStore = new PackStore({
      storage,
      fetchRemotePack: async () => {
        // 模拟 L3 网络请求还没返回时，另一批翻译结果已经通过 setMany 并发写入了同一个 lang
        await store.setMany('en', { xyz: 'concurrent-value' });
        return { version: 'v2', entries: { abc: 'new' } };
      },
    });

    await store.hydrate('en');

    const persisted = await storage.get('en');
    expect(persisted!.entries.abc?.translation).toBe('new'); // L3 权威数据应该生效
    expect(persisted!.entries.xyz?.translation).toBe('concurrent-value'); // L2 也不应该丢并发写入
  });

  it('setMany 应丢弃空字符串译文，不写入 L1/L2（空译文写回 DOM 等于抹掉页面内容）', async () => {
    const storage = createMemoryStorage();
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockResolvedValue(null);
    const store = new PackStore({ storage, fetchRemotePack });

    await store.setMany('en', { empty: '', ok: 'hello' });

    expect(store.get('en', 'empty')).toBeUndefined();
    expect(store.get('en', 'ok')).toBe('hello');
    const persisted = await storage.get('en');
    expect(persisted!.entries.empty).toBeUndefined();
    expect(persisted!.entries.ok?.translation).toBe('hello');
  });

  it('setMany 应丢弃纯空白译文，但必须保留 "0" 这类合法译文（不能用 falsy 判断）', async () => {
    const storage = createMemoryStorage();
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockResolvedValue(null);
    const store = new PackStore({ storage, fetchRemotePack });

    await store.setMany('en', { blank: '   ', newline: '\n\t', zero: '0', ok: 'hello' });

    // 纯空白写回 DOM 和空串一样是把内容抹掉，视觉上文本就消失了
    expect(store.get('en', 'blank')).toBeUndefined();
    expect(store.get('en', 'newline')).toBeUndefined();
    // "0" 是合法译文（计数、编号等），falsy 判断会把它误杀
    expect(store.get('en', 'zero')).toBe('0');
    expect(store.get('en', 'ok')).toBe('hello');
  });

  it('hydrate 应丢弃 L3 语言包里的空字符串译文', async () => {
    const storage = createMemoryStorage();
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockResolvedValue({ version: 'v1', entries: { empty: '', ok: 'hello' } });
    const store = new PackStore({ storage, fetchRemotePack });

    await store.hydrate('en');

    expect(store.get('en', 'empty')).toBeUndefined();
    expect(store.get('en', 'ok')).toBe('hello');
  });

  it('未 hydrate/setMany 过的 hash，get 应返回 undefined', async () => {
    const storage = createMemoryStorage();
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockResolvedValue(null);
    const store = new PackStore({ storage, fetchRemotePack });

    expect(store.get('en', 'missing')).toBeUndefined();
  });
});
