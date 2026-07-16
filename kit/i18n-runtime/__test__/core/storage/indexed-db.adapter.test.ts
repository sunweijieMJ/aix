import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbAdapter } from '../../../src/core/storage/indexed-db.adapter.js';
import type { PackData } from '../../../src/types.js';

describe('IndexedDbAdapter', () => {
  afterEach(async () => {
    const adapter = new IndexedDbAdapter();
    await adapter.clear('en');
  });

  it('set 后 get 应能读回同一份数据', async () => {
    const adapter = new IndexedDbAdapter();
    const data: PackData = {
      version: 'v1',
      entries: { abc: { translation: 'hello', lastUsedAt: 1 } },
    };

    await adapter.set('en', data);
    await expect(adapter.get('en')).resolves.toEqual(data);
  });

  it('get 不存在的语言应返回 null', async () => {
    const adapter = new IndexedDbAdapter();
    await expect(adapter.get('ko')).resolves.toBeNull();
  });

  it('clear 后 get 应返回 null', async () => {
    const adapter = new IndexedDbAdapter();
    await adapter.set('en', { version: 'v1', entries: {} });
    await adapter.clear('en');
    await expect(adapter.get('en')).resolves.toBeNull();
  });

  it('多次读写（含多个 adapter 实例）应该复用同一个 IndexedDB 连接，不应每次都新开一个', async () => {
    // 用 resetModules + 动态 import 拿一份全新的模块实例，让模块级的连接缓存重新从 undefined 开始，
    // 不受本文件其它用例已经打开过连接的影响
    vi.resetModules();
    const freshModule = await import('../../../src/core/storage/indexed-db.adapter.js');
    const openSpy = vi.spyOn(indexedDB, 'open');

    const adapterA = new freshModule.IndexedDbAdapter();
    await adapterA.set('en', { version: 'v1', entries: {} });
    await adapterA.get('en');
    const adapterB = new freshModule.IndexedDbAdapter();
    await adapterB.get('ja');
    await adapterB.clear('en');

    expect(openSpy).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
  });
});
