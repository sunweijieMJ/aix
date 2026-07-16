import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageAdapter } from '../../../src/core/storage/local-storage.adapter.js';
import type { PackData } from '../../../src/types.js';

describe('LocalStorageAdapter', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('set 后 get 应能读回同一份数据', async () => {
    const adapter = new LocalStorageAdapter();
    const data: PackData = {
      version: 'v1',
      entries: { abc: { translation: 'hello', lastUsedAt: 1 } },
    };

    await adapter.set('en', data);
    await expect(adapter.get('en')).resolves.toEqual(data);
  });

  it('get 不存在的语言应返回 null', async () => {
    const adapter = new LocalStorageAdapter();
    await expect(adapter.get('ja')).resolves.toBeNull();
  });

  it('get 到损坏的 JSON 应返回 null 而不是抛错', async () => {
    localStorage.setItem('i18n-pack:en', '{not valid json');
    const adapter = new LocalStorageAdapter();
    await expect(adapter.get('en')).resolves.toBeNull();
  });

  it('超过 maxEntries 时应按 lastUsedAt 做 LRU 淘汰', async () => {
    const adapter = new LocalStorageAdapter({ maxEntries: 2 });
    const data: PackData = {
      version: 'v1',
      entries: {
        old: { translation: 'old', lastUsedAt: 1 },
        mid: { translation: 'mid', lastUsedAt: 2 },
        new: { translation: 'new', lastUsedAt: 3 },
      },
    };

    await adapter.set('en', data);
    const stored = await adapter.get('en');

    expect(Object.keys(stored!.entries).sort()).toEqual(['mid', 'new']);
  });

  it('写入配额溢出时应缩容重试而不是抛出异常', async () => {
    const adapter = new LocalStorageAdapter({ maxEntries: 100 });
    // 本仓库 vitest 共享 setup（internal/vitest-config/setup.ts）把 global.localStorage
    // 整体替换成了基于 Map 的手写 mock，setItem 本身已经是 vi.fn()：
    // 1) 它是 own property 而非继承自 Storage.prototype，spy 必须挂在实例上才能拦截到调用；
    // 2) 直接 bind 现有 setItem 再 spyOn 会拿到同一个 mock 对象引用，
    //    mockImplementation 替换的是这个对象的内部实现，bind 出来的"original"也会
    //    跟着变成新实现，导致自我递归（栈溢出）。改用 getMockImplementation() 取出
    //    创建时的原始纯函数，与 mock 对象本身解耦，才能安全地在第二次调用时回退真实写入。
    const originalSetItem = vi.mocked(localStorage.setItem).getMockImplementation()!;
    let calls = 0;
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      calls += 1;
      if (calls === 1) {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      originalSetItem(key, value);
    });

    const data: PackData = {
      version: 'v1',
      entries: { abc: { translation: 'hello', lastUsedAt: 1 } },
    };

    await expect(adapter.set('en', data)).resolves.not.toThrow();
    expect(calls).toBe(2);
  });
});
