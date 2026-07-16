import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveStorageAdapter } from '../../../src/core/storage/index.js';
import { LocalStorageAdapter } from '../../../src/core/storage/local-storage.adapter.js';
import { IndexedDbAdapter } from '../../../src/core/storage/indexed-db.adapter.js';
import type { PackStorageAdapter } from '../../../src/types.js';

describe('resolveStorageAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未传 option 时应默认返回 LocalStorageAdapter', () => {
    expect(resolveStorageAdapter(undefined, undefined)).toBeInstanceOf(LocalStorageAdapter);
  });

  it("option 为 'localStorage' 时应返回 LocalStorageAdapter", () => {
    expect(resolveStorageAdapter('localStorage', undefined)).toBeInstanceOf(LocalStorageAdapter);
  });

  it("option 为 'indexedDB' 时应返回 IndexedDbAdapter", () => {
    expect(resolveStorageAdapter('indexedDB', undefined)).toBeInstanceOf(IndexedDbAdapter);
  });

  it('option 为自定义 adapter 对象时应原样返回该实例', () => {
    const custom: PackStorageAdapter = {
      async get() {
        return null;
      },
      async set() {},
    };
    expect(resolveStorageAdapter(custom, undefined)).toBe(custom);
  });

  it("option 为 'indexedDB' 且传了 maxEntries 时应打印 warn 提示该配置被忽略", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveStorageAdapter('indexedDB', 500);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("option 为 'indexedDB' 且未传 maxEntries 时不应打印 warn", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveStorageAdapter('indexedDB', undefined);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
