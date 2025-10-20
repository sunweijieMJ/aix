import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCacheManager } from '../../src/cache';
import type { ICacheConfig } from '../../src/cache';

describe('MemoryCacheManager', () => {
  let cacheManager: MemoryCacheManager;
  const config: ICacheConfig = {
    type: 'memory',
    defaultTtl: 300,
    checkPeriod: 60,
  };

  beforeEach(() => {
    cacheManager = new MemoryCacheManager(config);
  });

  describe('set and get', () => {
    it('should set and get a value', async () => {
      await cacheManager.set('test-key', 'test-value');
      const value = await cacheManager.get<string>('test-key');

      expect(value).toBe('test-value');
    });

    it('should set and get an object', async () => {
      const testObj = { name: 'test', value: 123 };
      await cacheManager.set('test-obj', testObj);
      const value = await cacheManager.get<typeof testObj>('test-obj');

      expect(value).toEqual(testObj);
    });

    it('should return undefined for non-existent key', async () => {
      const value = await cacheManager.get('non-existent');

      expect(value).toBeUndefined();
    });

    it('should respect custom TTL', async () => {
      await cacheManager.set('short-lived', 'value', 1); // 1 second TTL

      const immediateValue = await cacheManager.get('short-lived');
      expect(immediateValue).toBe('value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const expiredValue = await cacheManager.get('short-lived');
      expect(expiredValue).toBeUndefined();
    });
  });

  describe('del', () => {
    it('should delete a key', async () => {
      await cacheManager.set('test-key', 'test-value');
      const deleted = await cacheManager.del('test-key');

      expect(deleted).toBe(true);

      const value = await cacheManager.get('test-key');
      expect(value).toBeUndefined();
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await cacheManager.del('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for existing key', async () => {
      await cacheManager.set('test-key', 'test-value');
      const exists = await cacheManager.has('test-key');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await cacheManager.has('non-existent');

      expect(exists).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all keys', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      await cacheManager.set('key3', 'value3');

      await cacheManager.clear();

      const value1 = await cacheManager.get('key1');
      const value2 = await cacheManager.get('key2');
      const value3 = await cacheManager.get('key3');

      expect(value1).toBeUndefined();
      expect(value2).toBeUndefined();
      expect(value3).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      // Set some values
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');

      // Get some values (hits)
      await cacheManager.get('key1');
      await cacheManager.get('key2');

      // Try to get non-existent values (misses)
      await cacheManager.get('non-existent1');
      await cacheManager.get('non-existent2');

      const stats = await cacheManager.getStats();

      expect(stats.keys).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(50); // 2 hits / 4 total = 50%
    });

    it('should calculate hit rate correctly with no requests', async () => {
      const stats = await cacheManager.getStats();

      expect(stats.keys).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('mset', () => {
    it('should batch set multiple values', async () => {
      const data = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2', ttl: 100 },
        { key: 'key3', value: { nested: 'object' } },
      ];

      const result = await cacheManager.mset(data);

      expect(result).toBe(true);

      const value1 = await cacheManager.get('key1');
      const value2 = await cacheManager.get('key2');
      const value3 = await cacheManager.get('key3');

      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
      expect(value3).toEqual({ nested: 'object' });
    });
  });

  describe('mget', () => {
    it('should batch get multiple values', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      await cacheManager.set('key3', 'value3');

      const result = await cacheManager.mget<string>(['key1', 'key2', 'key3', 'non-existent']);

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
        'non-existent': undefined,
      });
    });
  });

  describe('mdel', () => {
    it('should batch delete multiple values', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      await cacheManager.set('key3', 'value3');

      const deletedCount = await cacheManager.mdel(['key1', 'key2', 'non-existent']);

      expect(deletedCount).toBe(2);

      const value1 = await cacheManager.get('key1');
      const value2 = await cacheManager.get('key2');
      const value3 = await cacheManager.get('key3');

      expect(value1).toBeUndefined();
      expect(value2).toBeUndefined();
      expect(value3).toBe('value3');
    });
  });

  describe('close', () => {
    it('should close cache without errors', async () => {
      await cacheManager.set('test-key', 'test-value');

      // 验证设置成功
      const valueBeforeClose = await cacheManager.get('test-key');
      expect(valueBeforeClose).toBe('test-value');

      await cacheManager.close();

      // node-cache的close()方法实际上不会清空缓存，只是停止检查周期
      // 所以这个测试只验证close()不会抛出错误
      expect(true).toBe(true);
    });
  });
});
