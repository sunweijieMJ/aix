import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheItem } from '../src/types/index';
import { CacheManager } from '../src/utils/cache';

// Mock fs modules
vi.mock('fs/promises');
vi.mock('fs');

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  const testCacheDir = '/test/cache';
  const testTTL = 1000; // 1 second for testing

  beforeEach(() => {
    vi.clearAllMocks();
    cacheManager = new CacheManager(testCacheDir);
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

  describe('文件缓存', () => {
    it('应该尝试从文件加载缓存', async () => {
      const key = 'test-key';
      const cachedData: CacheItem = {
        data: { test: 'data' },
        timestamp: Date.now(),
        ttl: testTTL * 10, // 确保不会过期
      };

      // 计算预期的文件路径（与CacheManager中的逻辑一致）
      const hash = Buffer.from(key).toString('base64').replace(/[/+=]/g, '_');
      const expectedPath = path.join(testCacheDir, `${hash}.json`);

      // Mock文件存在检查和读取
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cachedData));

      const result = await cacheManager.get(key);

      expect(fs.readFile).toHaveBeenCalledWith(expectedPath, 'utf8');
      expect(result).toEqual(cachedData.data);
    });

    it('应该将缓存保存到文件', async () => {
      const key = 'test-key';
      const value = { data: 'test-data', type: 'test' };

      // Mock文件写入
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await cacheManager.set(key, value);

      expect(fs.mkdir).toHaveBeenCalledWith(testCacheDir, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('应该处理文件读取错误', async () => {
      const key = 'test-key';

      // Mock文件读取失败
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      const result = await cacheManager.get(key);

      expect(result).toBeNull();
    });

    it('应该处理无效的JSON文件', async () => {
      const key = 'test-key';

      // Mock读取无效JSON
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await cacheManager.get(key);

      expect(result).toBeNull();
    });

    it('应该忽略过期的文件缓存', async () => {
      const key = 'test-key';
      const expiredData: CacheItem = {
        data: { test: 'data' },
        timestamp: Date.now() - testTTL * 2, // 已过期
        ttl: testTTL,
      };

      // Mock文件读取
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(expiredData));
      vi.mocked(fs.access).mockResolvedValue(undefined);

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
    it('应该处理设置缓存时的错误', async () => {
      // Mock文件写入失败
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Mkdir failed'));

      // 应该不抛出错误，只是不保存到文件
      await expect(
        cacheManager.set('key', { data: 'data', type: 'test' }),
      ).resolves.not.toThrow();

      // 内存缓存应该仍然工作
      const result = await cacheManager.get('key');
      expect(result).toEqual({ data: 'data', type: 'test' });
    });

    it('应该处理获取缓存时的错误', async () => {
      // Mock文件读取失败
      vi.mocked(fs.access).mockRejectedValue(new Error('Access failed'));

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
  });
});
