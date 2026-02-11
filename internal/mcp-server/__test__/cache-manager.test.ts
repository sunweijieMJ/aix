/**
 * CacheManager 测试 (简化版)
 *
 * 简化后的 CacheManager 只使用内存缓存，不再使用文件系统。
 * 这对于 MCP Server 的使用场景来说已经足够。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CacheManager } from '../src/utils/cache';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  describe('内存缓存', () => {
    it('应该能够设置和获取缓存项', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', type: 'test' };

      await cacheManager.set(key, value);
      const result = await cacheManager.get(key);

      expect(result).toEqual(value);
    });

    it('应该在TTL过期后返回null', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', type: 'test' };

      // 设置一个很短的TTL (50ms)
      await cacheManager.set(key, value, 50);

      // 立即检查应该能获取到
      let result = await cacheManager.get(key);
      expect(result).toEqual(value);

      // 等待TTL过期
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 过期后应该返回null
      result = await cacheManager.get(key);
      expect(result).toBeNull();
    });

    it('应该能够检查缓存项是否存在', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', type: 'test' };

      // 通过 get 方法检查是否存在
      expect(await cacheManager.get(key)).toBeNull();

      await cacheManager.set(key, value);
      expect(await cacheManager.get(key)).toEqual(value);
    });

    it('应该能够删除缓存项', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', type: 'test' };

      await cacheManager.set(key, value);
      expect(await cacheManager.get(key)).toEqual(value);

      await cacheManager.delete(key);
      expect(await cacheManager.get(key)).toBeNull();
    });

    it('应该能够清空所有缓存', async () => {
      await cacheManager.set('key1', { data: 'data1', type: 'test' });
      await cacheManager.set('key2', { data: 'data2', type: 'test' });

      expect(await cacheManager.get('key1')).toEqual({
        data: 'data1',
        type: 'test',
      });
      expect(await cacheManager.get('key2')).toEqual({
        data: 'data2',
        type: 'test',
      });

      await cacheManager.clear();

      expect(await cacheManager.get('key1')).toBeNull();
      expect(await cacheManager.get('key2')).toBeNull();
    });
  });

  describe('纯内存缓存 (简化版)', () => {
    it('应该只使用内存缓存，不涉及文件操作', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', type: 'test' };

      // 设置缓存
      await cacheManager.set(key, value);

      // 获取缓存
      const result = await cacheManager.get(key);
      expect(result).toEqual(value);

      // 简化版不再使用文件系统，所有数据只在内存中
      const stats = cacheManager.getStats();
      expect(stats.memoryItems).toBe(1);
    });

    it('应该正确处理不存在的缓存项', async () => {
      const result = await cacheManager.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('应该正确处理过期的缓存项', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', type: 'test' };

      // 设置一个很短的TTL
      await cacheManager.set(key, value, 50);

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 过期后应该返回null
      const result = await cacheManager.get(key);
      expect(result).toBeNull();
    });
  });

  describe('缓存统计', () => {
    it('应该返回正确的缓存统计信息', async () => {
      await cacheManager.set('key1', { data: 'data1', type: 'test' });
      await cacheManager.set('key2', { data: 'data2', type: 'test' });

      const stats = cacheManager.getStats();

      expect(stats).toHaveProperty('memoryItems');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');

      expect(stats.memoryItems).toBe(2);
    });

    it('应该正确计算命中率', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', type: 'test' };

      // 设置缓存
      await cacheManager.set(key, value);

      // 命中缓存
      await cacheManager.get(key);
      await cacheManager.get(key);

      // 未命中缓存
      await cacheManager.get('non-existent-key');

      const stats = cacheManager.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(parseFloat(stats.hitRate)).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('TTL管理', () => {
    it('应该自动清理过期的缓存项', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', type: 'test' };

      // 设置一个很短的TTL
      await cacheManager.set(key, value, 100);
      expect(await cacheManager.get(key)).toEqual(value);

      // 等待TTL过期
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 触发清理
      await cacheManager.cleanupExpired();

      expect(await cacheManager.get(key)).toBeNull();
    });

    it('应该能够手动清理过期缓存', async () => {
      const key1 = 'key1';
      const key2 = 'key2';

      // 设置第一个缓存，短TTL
      await cacheManager.set(key1, { data: 'data1', type: 'test' }, 100);

      // 等待一段时间
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 设置第二个缓存，长TTL
      await cacheManager.set(key2, { data: 'data2', type: 'test' }, 1000);

      // 等待第一个缓存过期
      await new Promise((resolve) => setTimeout(resolve, 100));

      await cacheManager.cleanupExpired();

      expect(await cacheManager.get(key1)).toBeNull();
      expect(await cacheManager.get(key2)).toEqual({
        data: 'data2',
        type: 'test',
      });
    });
  });

  describe('并发处理', () => {
    it('应该正确处理并发读写', async () => {
      const key = 'test-key';
      const promises = [];

      // 并发写入
      for (let i = 0; i < 10; i++) {
        promises.push(
          cacheManager.set(`${key}-${i}`, { data: `data-${i}`, type: 'test' }),
        );
      }

      await Promise.all(promises);

      // 并发读取
      const readPromises = [];
      for (let i = 0; i < 10; i++) {
        readPromises.push(cacheManager.get(`${key}-${i}`));
      }

      const results = await Promise.all(readPromises);

      results.forEach((result, index) => {
        expect(result).toEqual({ data: `data-${index}`, type: 'test' });
      });
    });
  });

  describe('错误处理', () => {
    it('应该处理设置缓存时的各种数据类型', async () => {
      // 字符串
      await cacheManager.set('string-key', 'simple string');
      expect(await cacheManager.get('string-key')).toBe('simple string');

      // 数字
      await cacheManager.set('number-key', 42);
      expect(await cacheManager.get('number-key')).toBe(42);

      // 数组
      await cacheManager.set('array-key', [1, 2, 3]);
      expect(await cacheManager.get('array-key')).toEqual([1, 2, 3]);

      // 对象
      await cacheManager.set('object-key', { nested: { value: true } });
      expect(await cacheManager.get('object-key')).toEqual({
        nested: { value: true },
      });
    });

    it('应该处理获取不存在的缓存项', async () => {
      const result = await cacheManager.get('non-existent-key');
      expect(result).toBeNull();
    });
  });

  describe('内存管理', () => {
    it('应该正确管理内存缓存', async () => {
      // 测试内存缓存的基本功能
      await cacheManager.set('key1', { data: 'data1', type: 'test' });
      await cacheManager.set('key2', { data: 'data2', type: 'test' });
      await cacheManager.set('key3', { data: 'data3', type: 'test' });

      const stats = cacheManager.getStats();
      expect(stats.memoryItems).toBe(3);

      // 清理所有缓存
      await cacheManager.clear();
      const statsAfterClear = cacheManager.getStats();
      expect(statsAfterClear.memoryItems).toBe(0);
    });

    it('应该返回缓存大小估算', async () => {
      await cacheManager.set('key1', { data: 'some data' });
      await cacheManager.set('key2', { data: 'more data', nested: { a: 1 } });

      const stats = cacheManager.getStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.sizeFormatted).toBeDefined();
    });
  });
});
