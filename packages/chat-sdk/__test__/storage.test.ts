/**
 * @fileoverview Storage 适配器测试
 * 测试 MemoryStorageAdapter 和存储适配器接口
 * 注意：LocalStorage/SessionStorage/IndexedDB 需要浏览器环境
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryStorageAdapter,
  LocalStorageAdapter,
  SessionStorageAdapter,
  IndexedDBStorageAdapter,
  createMemoryStorageAdapter,
  createLocalStorageAdapter,
  createSessionStorageAdapter,
  createIndexedDBStorageAdapter,
} from '../src/core/storage';
import type { ChatMessage } from '../src/types';

describe('core/storage', () => {
  const createTestMessages = (): ChatMessage[] => [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      createAt: Date.now(),
      updateAt: Date.now(),
      status: 'success',
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      createAt: Date.now(),
      updateAt: Date.now(),
      status: 'success',
    },
  ];

  describe('MemoryStorageAdapter', () => {
    let adapter: MemoryStorageAdapter;

    beforeEach(() => {
      adapter = new MemoryStorageAdapter();
    });

    describe('load', () => {
      it('should return null for non-existent key', async () => {
        const result = await adapter.load('non-existent');
        expect(result).toBeNull();
      });

      it('should load saved messages', async () => {
        const messages = createTestMessages();
        await adapter.save('test-key', messages);

        const result = await adapter.load('test-key');

        expect(result).toEqual(messages);
      });

      it('should return a copy of messages', async () => {
        const messages = createTestMessages();
        await adapter.save('test-key', messages);

        const result1 = await adapter.load('test-key');
        const result2 = await adapter.load('test-key');

        expect(result1).not.toBe(result2);
        expect(result1).toEqual(result2);
      });
    });

    describe('save', () => {
      it('should save messages', async () => {
        const messages = createTestMessages();

        await adapter.save('test-key', messages);

        const result = await adapter.load('test-key');
        expect(result).toEqual(messages);
      });

      it('should overwrite existing messages', async () => {
        const messages1 = createTestMessages();
        const messages2 = [{ ...messages1[0]!, content: 'Updated' }];

        await adapter.save('test-key', messages1);
        await adapter.save('test-key', messages2);

        const result = await adapter.load('test-key');
        expect(result).toEqual(messages2);
      });

      it('should store array reference independently', async () => {
        const messages = createTestMessages();
        await adapter.save('test-key', messages);

        // Push to original array should not affect stored data
        messages.push({
          id: 'msg-3',
          role: 'user',
          content: 'New message',
          createAt: Date.now(),
          updateAt: Date.now(),
          status: 'success',
        });

        const result = await adapter.load('test-key');
        // Shallow copy means array length is independent
        expect(result).toHaveLength(2);
      });
    });

    describe('clear', () => {
      it('should clear specific key', async () => {
        await adapter.save('key-1', createTestMessages());
        await adapter.save('key-2', createTestMessages());

        await adapter.clear('key-1');

        expect(await adapter.load('key-1')).toBeNull();
        expect(await adapter.load('key-2')).not.toBeNull();
      });
    });

    describe('keys', () => {
      it('should return empty array when no data', () => {
        expect(adapter.keys()).toEqual([]);
      });

      it('should return all keys', async () => {
        await adapter.save('key-1', createTestMessages());
        await adapter.save('key-2', createTestMessages());

        const keys = adapter.keys();

        expect(keys).toContain('key-1');
        expect(keys).toContain('key-2');
        expect(keys.length).toBe(2);
      });
    });

    describe('clearAll', () => {
      it('should clear all data', async () => {
        await adapter.save('key-1', createTestMessages());
        await adapter.save('key-2', createTestMessages());

        adapter.clearAll();

        expect(adapter.keys()).toEqual([]);
        expect(adapter.size()).toBe(0);
      });
    });

    describe('size', () => {
      it('should return 0 when empty', () => {
        expect(adapter.size()).toBe(0);
      });

      it('should return correct count', async () => {
        await adapter.save('key-1', createTestMessages());
        expect(adapter.size()).toBe(1);

        await adapter.save('key-2', createTestMessages());
        expect(adapter.size()).toBe(2);
      });
    });
  });

  describe('LocalStorageAdapter (no browser environment)', () => {
    let adapter: LocalStorageAdapter;

    beforeEach(() => {
      adapter = new LocalStorageAdapter();
    });

    it('should return null when localStorage unavailable', async () => {
      const result = await adapter.load('test');
      expect(result).toBeNull();
    });

    it('should handle save gracefully when unavailable', async () => {
      await expect(
        adapter.save('test', createTestMessages()),
      ).resolves.not.toThrow();
    });

    it('should handle clear gracefully when unavailable', async () => {
      await expect(adapter.clear('test')).resolves.not.toThrow();
    });

    it('should use custom prefix', () => {
      const customAdapter = new LocalStorageAdapter('custom:');
      expect(customAdapter).toBeInstanceOf(LocalStorageAdapter);
    });
  });

  describe('SessionStorageAdapter (no browser environment)', () => {
    let adapter: SessionStorageAdapter;

    beforeEach(() => {
      adapter = new SessionStorageAdapter();
    });

    it('should return null when sessionStorage unavailable', async () => {
      const result = await adapter.load('test');
      expect(result).toBeNull();
    });

    it('should handle save gracefully when unavailable', async () => {
      await expect(
        adapter.save('test', createTestMessages()),
      ).resolves.not.toThrow();
    });

    it('should handle clear gracefully when unavailable', async () => {
      await expect(adapter.clear('test')).resolves.not.toThrow();
    });

    it('should use custom prefix', () => {
      const customAdapter = new SessionStorageAdapter('session:');
      expect(customAdapter).toBeInstanceOf(SessionStorageAdapter);
    });
  });

  describe('IndexedDBStorageAdapter (no browser environment)', () => {
    let adapter: IndexedDBStorageAdapter;

    beforeEach(() => {
      adapter = new IndexedDBStorageAdapter();
    });

    it('should return null when IndexedDB unavailable', async () => {
      const result = await adapter.load('test');
      expect(result).toBeNull();
    });

    it('should use custom db and store names', () => {
      const customAdapter = new IndexedDBStorageAdapter('my-db', 'my-store');
      expect(customAdapter).toBeInstanceOf(IndexedDBStorageAdapter);
    });

    it('should have close method', () => {
      expect(typeof adapter.close).toBe('function');
      adapter.close(); // Should not throw
    });
  });

  describe('Factory functions', () => {
    it('should create MemoryStorageAdapter', () => {
      const adapter = createMemoryStorageAdapter();
      expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
    });

    it('should create LocalStorageAdapter', () => {
      const adapter = createLocalStorageAdapter();
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('should create LocalStorageAdapter with prefix', () => {
      const adapter = createLocalStorageAdapter('custom:');
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('should create SessionStorageAdapter', () => {
      const adapter = createSessionStorageAdapter();
      expect(adapter).toBeInstanceOf(SessionStorageAdapter);
    });

    it('should create SessionStorageAdapter with prefix', () => {
      const adapter = createSessionStorageAdapter('custom:');
      expect(adapter).toBeInstanceOf(SessionStorageAdapter);
    });

    it('should create IndexedDBStorageAdapter', () => {
      const adapter = createIndexedDBStorageAdapter();
      expect(adapter).toBeInstanceOf(IndexedDBStorageAdapter);
    });

    it('should create IndexedDBStorageAdapter with custom names', () => {
      const adapter = createIndexedDBStorageAdapter('my-db', 'my-store');
      expect(adapter).toBeInstanceOf(IndexedDBStorageAdapter);
    });
  });
});
