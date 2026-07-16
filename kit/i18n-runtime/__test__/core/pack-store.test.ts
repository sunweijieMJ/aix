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

  it('未 hydrate/setMany 过的 hash，get 应返回 undefined', async () => {
    const storage = createMemoryStorage();
    const fetchRemotePack = vi
      .fn<(lang: string) => Promise<RemotePack | null>>()
      .mockResolvedValue(null);
    const store = new PackStore({ storage, fetchRemotePack });

    expect(store.get('en', 'missing')).toBeUndefined();
  });
});
