import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigService } from '../../src/services/localConfigService';
import type { ILocalConfig } from '../../src/types';

// Mock dependencies
vi.mock('../../src/database', () => ({
  getPostgresAdapter: vi.fn(() => mockPgAdapter),
}));

vi.mock('../../src/cache', () => ({
  getCacheManager: vi.fn(() => mockCacheManager),
}));

// Mock PG Adapter
const mockPgAdapter = {
  getAllLocalConfigs: vi.fn(),
  getLocalConfigByPath: vi.fn(),
  createLocalConfig: vi.fn(),
  updateLocalConfig: vi.fn(),
  deleteLocalConfig: vi.fn(),
  deleteLocalConfigsByPaths: vi.fn(),
  clearAllLocalConfigs: vi.fn(),
};

// Mock Cache Manager
const mockCacheManager = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  has: vi.fn(),
  clear: vi.fn(),
  getStats: vi.fn(),
  close: vi.fn(),
};

describe('ConfigService', () => {
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getAll', () => {
    it('should return all configs from cache if available', async () => {
      const mockConfigs: ILocalConfig[] = [
        {
          id: 1,
          path: 'test.config',
          value: '{"key":"value"}',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockCacheManager.get.mockResolvedValue(mockConfigs);

      const result = await configService.getAll();

      expect(result).toEqual(mockConfigs);
      expect(mockCacheManager.get).toHaveBeenCalledWith('config:all');
      expect(mockPgAdapter.getAllLocalConfigs).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if cache miss', async () => {
      const mockDbConfigs: ILocalConfig[] = [
        {
          id: 1,
          path: 'test.config',
          value: '{"key":"value"}',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockCacheManager.get.mockResolvedValue(null);
      mockPgAdapter.getAllLocalConfigs.mockResolvedValue(mockDbConfigs);

      const result = await configService.getAll();

      expect(result).toHaveLength(1);
      expect(result[0]?.path).toBe('test.config');
      expect(result[0]?.value).toEqual({ key: 'value' }); // JSON parsed
      expect(mockCacheManager.set).toHaveBeenCalledWith('config:all', expect.any(Array), 300);
    });

    it('should handle errors gracefully', async () => {
      mockCacheManager.get.mockRejectedValue(new Error('Cache error'));

      await expect(configService.getAll()).rejects.toThrow('Cache error');
    });
  });

  describe('getByPath', () => {
    it('should return config from cache if available', async () => {
      const mockConfig: ILocalConfig = {
        id: 1,
        path: 'test.config',
        value: { key: 'value' },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockCacheManager.get.mockResolvedValue(mockConfig);

      const result = await configService.getByPath('test.config');

      expect(result).toEqual(mockConfig);
      expect(mockCacheManager.get).toHaveBeenCalledWith('config:test.config');
      expect(mockPgAdapter.getLocalConfigByPath).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if cache miss', async () => {
      const mockDbConfig: ILocalConfig = {
        id: 1,
        path: 'test.config',
        value: '{"key":"value"}',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockPgAdapter.getLocalConfigByPath.mockResolvedValue(mockDbConfig);

      const result = await configService.getByPath('test.config');

      expect(result).not.toBeNull();
      expect(result?.path).toBe('test.config');
      expect(result?.value).toEqual({ key: 'value' });
      expect(mockCacheManager.set).toHaveBeenCalledWith('config:test.config', expect.any(Object), 300);
    });

    it('should return null if config not found', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockPgAdapter.getLocalConfigByPath.mockResolvedValue(null);

      const result = await configService.getByPath('nonexistent.config');

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should create new config if not exists', async () => {
      const newConfig: ILocalConfig = {
        id: 1,
        path: 'new.config',
        value: '{"key":"value"}',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockPgAdapter.getLocalConfigByPath.mockResolvedValue(null);
      mockPgAdapter.createLocalConfig.mockResolvedValue(newConfig);

      const result = await configService.upsert('new.config', { key: 'value' });

      expect(result.path).toBe('new.config');
      expect(result.value).toEqual({ key: 'value' });
      expect(mockPgAdapter.createLocalConfig).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalledTimes(2); // clear cache
    });

    it('should update existing config', async () => {
      const existingConfig: ILocalConfig = {
        id: 1,
        path: 'existing.config',
        value: '{"old":"value"}',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const updatedConfig: ILocalConfig = {
        ...existingConfig,
        value: '{"new":"value"}',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      mockPgAdapter.getLocalConfigByPath.mockResolvedValue(existingConfig);
      mockPgAdapter.updateLocalConfig.mockResolvedValue(updatedConfig);

      const result = await configService.upsert('existing.config', { new: 'value' });

      expect(result.value).toEqual({ new: 'value' });
      expect(mockPgAdapter.updateLocalConfig).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    it('should delete existing config and clear cache', async () => {
      const existingConfig: ILocalConfig = {
        id: 1,
        path: 'test.config',
        value: '{}',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockPgAdapter.getLocalConfigByPath.mockResolvedValue(existingConfig);
      mockPgAdapter.deleteLocalConfig.mockResolvedValue(true);

      const result = await configService.delete('test.config');

      expect(result).toBe(true);
      expect(mockPgAdapter.deleteLocalConfig).toHaveBeenCalledWith(1);
      expect(mockCacheManager.del).toHaveBeenCalledTimes(2);
    });

    it('should return false if config does not exist', async () => {
      mockPgAdapter.getLocalConfigByPath.mockResolvedValue(null);

      const result = await configService.delete('nonexistent.config');

      expect(result).toBe(false);
      expect(mockPgAdapter.deleteLocalConfig).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should throw error if config does not exist', async () => {
      mockPgAdapter.getLocalConfigByPath.mockResolvedValue(null);
      mockCacheManager.get.mockResolvedValue(null);

      await expect(configService.update('nonexistent.config', { value: {} })).rejects.toThrow('不存在');
    });
  });

  describe('clear', () => {
    it('should delete all configs', async () => {
      mockPgAdapter.clearAllLocalConfigs.mockResolvedValue(2);

      const result = await configService.clear();

      expect(result).toBe(2);
      expect(mockPgAdapter.clearAllLocalConfigs).toHaveBeenCalledTimes(1);
      expect(mockCacheManager.del).toHaveBeenCalledWith('config:all');
    });
  });

  describe('deleteBatch', () => {
    it('should delete multiple configs by paths', async () => {
      const paths = ['config1', 'config2', 'config3'];
      mockPgAdapter.deleteLocalConfigsByPaths.mockResolvedValue(3);

      const result = await configService.deleteBatch(paths);

      expect(result).toBe(3);
      expect(mockPgAdapter.deleteLocalConfigsByPaths).toHaveBeenCalledWith(paths);
      expect(mockCacheManager.del).toHaveBeenCalledTimes(4); // 3 paths + 1 'all'
    });

    it('should return 0 if paths array is empty', async () => {
      const result = await configService.deleteBatch([]);

      expect(result).toBe(0);
      expect(mockPgAdapter.deleteLocalConfigsByPaths).not.toHaveBeenCalled();
    });
  });
});
