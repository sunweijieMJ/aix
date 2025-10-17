import * as fs from 'fs/promises';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs module
vi.mock('fs/promises');

// Mock配置管理器
interface Config {
  packagesDir: string;
  outputDir: string;
  cacheDir: string;
  cacheTTL: number;
  ignorePackages: string[];
  enableCache: boolean;
  verbose: boolean;
  maxConcurrent?: number;
  port?: number;
  host?: string;
}

class MockConfigManager {
  private defaultConfig: Config = {
    packagesDir: '../../packages',
    outputDir: './data',
    cacheDir: './data/.cache',
    cacheTTL: 3600000, // 1小时
    ignorePackages: [],
    enableCache: true,
    verbose: false,
  };

  async loadConfig(configPath?: string): Promise<Config> {
    let config = { ...this.defaultConfig };

    // 从环境变量加载
    config = this.loadFromEnv(config);

    // 从配置文件加载
    if (configPath) {
      const fileConfig = await this.loadFromFile(configPath);
      config = { ...config, ...fileConfig };
    }

    return this.validateConfig(config);
  }

  private loadFromEnv(config: Config): Config {
    return {
      ...config,
      packagesDir: process.env.MCP_PACKAGES_DIR || config.packagesDir,
      outputDir: process.env.MCP_DATA_DIR || config.outputDir,
      cacheDir: process.env.MCP_CACHE_DIR || config.cacheDir,
      cacheTTL: process.env.MCP_CACHE_TTL
        ? parseInt(process.env.MCP_CACHE_TTL, 10)
        : config.cacheTTL,
      enableCache:
        process.env.MCP_ENABLE_CACHE === 'false' ? false : config.enableCache,
      verbose: process.env.MCP_VERBOSE === 'true' ? true : config.verbose,
      maxConcurrent: process.env.MCP_MAX_CONCURRENT
        ? parseInt(process.env.MCP_MAX_CONCURRENT, 10)
        : config.maxConcurrent,
      port: process.env.MCP_PORT
        ? parseInt(process.env.MCP_PORT, 10)
        : config.port,
      host: process.env.MCP_HOST || config.host,
    };
  }

  private async loadFromFile(configPath: string): Promise<Partial<Config>> {
    try {
      await fs.access(configPath);
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private validateConfig(config: Config): Config {
    // 验证端口号
    if (config.port !== undefined && (config.port < 1 || config.port > 65535)) {
      throw new Error('端口号必须在1-65535之间');
    }

    // 验证TTL
    if (config.cacheTTL < 0) {
      throw new Error('缓存TTL不能为负数');
    }

    // 验证并发数
    if (config.maxConcurrent !== undefined && config.maxConcurrent < 1) {
      throw new Error('最大并发数必须大于0');
    }

    // 验证路径
    if (!config.packagesDir || !config.outputDir) {
      throw new Error('packagesDir和outputDir不能为空');
    }

    return config;
  }

  async saveConfig(config: Config, configPath: string): Promise<void> {
    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  getDefaultConfig(): Config {
    return { ...this.defaultConfig };
  }

  mergeConfigs(base: Config, override: Partial<Config>): Config {
    return {
      ...base,
      ...override,
      ignorePackages: override.ignorePackages || base.ignorePackages,
    };
  }
}

describe('ConfigManager', () => {
  let configManager: MockConfigManager;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    configManager = new MockConfigManager();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('应该返回默认配置', async () => {
      const config = await configManager.loadConfig();

      expect(config).toEqual({
        packagesDir: '../../packages',
        outputDir: './data',
        cacheDir: './data/.cache',
        cacheTTL: 3600000,
        ignorePackages: [],
        enableCache: true,
        verbose: false,
      });
    });

    it('应该从环境变量加载配置', async () => {
      process.env.MCP_PACKAGES_DIR = '/env/packages';
      process.env.MCP_DATA_DIR = '/env/data';
      process.env.MCP_CACHE_TTL = '7200000';
      process.env.MCP_VERBOSE = 'true';
      process.env.MCP_ENABLE_CACHE = 'false';
      process.env.MCP_MAX_CONCURRENT = '4';
      process.env.MCP_PORT = '8080';
      process.env.MCP_HOST = '0.0.0.0';

      const config = await configManager.loadConfig();

      expect(config.packagesDir).toBe('/env/packages');
      expect(config.outputDir).toBe('/env/data');
      expect(config.cacheTTL).toBe(7200000);
      expect(config.verbose).toBe(true);
      expect(config.enableCache).toBe(false);
      expect(config.maxConcurrent).toBe(4);
      expect(config.port).toBe(8080);
      expect(config.host).toBe('0.0.0.0');
    });

    it('应该从配置文件加载配置', async () => {
      const fileConfig = {
        packagesDir: '/file/packages',
        outputDir: '/file/data',
        verbose: true,
        ignorePackages: ['test-package'],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(fileConfig));

      const config = await configManager.loadConfig('./config.json');

      expect(config.packagesDir).toBe('/file/packages');
      expect(config.outputDir).toBe('/file/data');
      expect(config.verbose).toBe(true);
      expect(config.ignorePackages).toEqual(['test-package']);
    });

    it('应该处理配置文件不存在的情况', async () => {
      vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' });

      const config = await configManager.loadConfig('./nonexistent.json');

      // 应该返回默认配置
      expect(config.packagesDir).toBe('../../packages');
    });

    it('应该处理无效的JSON配置文件', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(
        configManager.loadConfig('./invalid.json'),
      ).rejects.toThrow();
    });

    it('应该优先使用配置文件覆盖环境变量', async () => {
      process.env.MCP_PACKAGES_DIR = '/env/packages';

      const fileConfig = {
        packagesDir: '/file/packages',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(fileConfig));

      const config = await configManager.loadConfig('./config.json');

      expect(config.packagesDir).toBe('/file/packages');
    });
  });

  describe('validateConfig', () => {
    it('应该验证端口号范围', async () => {
      process.env.MCP_PORT = '0';
      await expect(configManager.loadConfig()).rejects.toThrow(
        '端口号必须在1-65535之间',
      );

      process.env.MCP_PORT = '65536';
      await expect(configManager.loadConfig()).rejects.toThrow(
        '端口号必须在1-65535之间',
      );
    });

    it('应该验证缓存TTL', async () => {
      process.env.MCP_CACHE_TTL = '-1';
      await expect(configManager.loadConfig()).rejects.toThrow(
        '缓存TTL不能为负数',
      );
    });

    it('应该验证最大并发数', async () => {
      process.env.MCP_MAX_CONCURRENT = '0';
      await expect(configManager.loadConfig()).rejects.toThrow(
        '最大并发数必须大于0',
      );
    });

    it('应该验证必需路径', async () => {
      const fileConfig = {
        packagesDir: '',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(fileConfig));

      await expect(configManager.loadConfig('./config.json')).rejects.toThrow(
        'packagesDir和outputDir不能为空',
      );
    });

    it('应该接受有效配置', async () => {
      process.env.MCP_PORT = '8080';
      process.env.MCP_CACHE_TTL = '3600000';
      process.env.MCP_MAX_CONCURRENT = '4';

      const config = await configManager.loadConfig();

      expect(config.port).toBe(8080);
      expect(config.cacheTTL).toBe(3600000);
      expect(config.maxConcurrent).toBe(4);
    });
  });

  describe('saveConfig', () => {
    it('应该正确保存配置文件', async () => {
      const config = configManager.getDefaultConfig();
      const configPath = './test-config.json';

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await configManager.saveConfig(config, configPath);

      expect(fs.mkdir).toHaveBeenCalledWith('.', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        configPath,
        JSON.stringify(config, null, 2),
      );
    });

    it('应该创建配置目录', async () => {
      const config = configManager.getDefaultConfig();
      const configPath = './config/test.json';

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await configManager.saveConfig(config, configPath);

      expect(fs.mkdir).toHaveBeenCalledWith('./config', { recursive: true });
    });

    it('应该处理保存失败', async () => {
      const config = configManager.getDefaultConfig();
      const configPath = './test-config.json';

      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

      await expect(
        configManager.saveConfig(config, configPath),
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('getDefaultConfig', () => {
    it('应该返回默认配置的副本', () => {
      const config1 = configManager.getDefaultConfig();
      const config2 = configManager.getDefaultConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // 不是同一个对象引用
    });

    it('应该包含所有必需字段', () => {
      const config = configManager.getDefaultConfig();

      expect(config).toHaveProperty('packagesDir');
      expect(config).toHaveProperty('outputDir');
      expect(config).toHaveProperty('cacheDir');
      expect(config).toHaveProperty('cacheTTL');
      expect(config).toHaveProperty('ignorePackages');
      expect(config).toHaveProperty('enableCache');
      expect(config).toHaveProperty('verbose');
    });
  });

  describe('mergeConfigs', () => {
    it('应该正确合并配置', () => {
      const base = configManager.getDefaultConfig();
      const override = {
        packagesDir: '/override/packages',
        verbose: true,
        port: 8080,
      };

      const merged = configManager.mergeConfigs(base, override);

      expect(merged.packagesDir).toBe('/override/packages');
      expect(merged.verbose).toBe(true);
      expect(merged.port).toBe(8080);
      expect(merged.outputDir).toBe(base.outputDir); // 保持原值
    });

    it('应该正确处理数组字段', () => {
      const base = configManager.getDefaultConfig();
      const override = {
        ignorePackages: ['test-package'],
      };

      const merged = configManager.mergeConfigs(base, override);

      expect(merged.ignorePackages).toEqual(['test-package']);
    });

    it('应该处理空覆盖配置', () => {
      const base = configManager.getDefaultConfig();
      const override = {};

      const merged = configManager.mergeConfigs(base, override);

      expect(merged).toEqual(base);
      expect(merged).not.toBe(base); // 不是同一个对象引用
    });
  });

  describe('环境变量类型转换', () => {
    it('应该正确转换布尔值', async () => {
      process.env.MCP_VERBOSE = 'true';
      process.env.MCP_ENABLE_CACHE = 'false';

      const config = await configManager.loadConfig();

      expect(config.verbose).toBe(true);
      expect(config.enableCache).toBe(false);
    });

    it('应该正确转换数字', async () => {
      process.env.MCP_CACHE_TTL = '7200000';
      process.env.MCP_MAX_CONCURRENT = '8';
      process.env.MCP_PORT = '3000';

      const config = await configManager.loadConfig();

      expect(config.cacheTTL).toBe(7200000);
      expect(config.maxConcurrent).toBe(8);
      expect(config.port).toBe(3000);
    });

    it('应该处理无效的数字环境变量', async () => {
      process.env.MCP_CACHE_TTL = 'invalid';

      const config = await configManager.loadConfig();

      expect(config.cacheTTL).toBeNaN();
    });
  });

  describe('配置优先级', () => {
    it('应该按正确顺序应用配置：默认 < 环境变量 < 配置文件', async () => {
      // 设置环境变量
      process.env.MCP_PACKAGES_DIR = '/env/packages';
      process.env.MCP_VERBOSE = 'true';

      // 设置配置文件
      const fileConfig = {
        packagesDir: '/file/packages', // 应该覆盖环境变量
        outputDir: '/file/data', // 应该覆盖默认值
        // verbose 不在文件中，应该使用环境变量的值
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(fileConfig));

      const config = await configManager.loadConfig('./config.json');

      expect(config.packagesDir).toBe('/file/packages'); // 文件覆盖环境变量
      expect(config.outputDir).toBe('/file/data'); // 文件覆盖默认值
      expect(config.verbose).toBe(true); // 环境变量覆盖默认值
      expect(config.enableCache).toBe(true); // 默认值
    });
  });

  describe('配置文件格式', () => {
    it('应该支持完整的配置文件', async () => {
      const fullConfig = {
        packagesDir: '/custom/packages',
        outputDir: '/custom/data',
        cacheDir: '/custom/cache',
        cacheTTL: 7200000,
        ignorePackages: ['test-package', 'demo-package'],
        enableCache: false,
        verbose: true,
        maxConcurrent: 8,
        port: 3000,
        host: '0.0.0.0',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(fullConfig));

      const config = await configManager.loadConfig('./full-config.json');

      expect(config).toEqual(fullConfig);
    });

    it('应该支持部分配置文件', async () => {
      const partialConfig = {
        verbose: true,
        ignorePackages: ['test-package'],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(partialConfig));

      const config = await configManager.loadConfig('./partial-config.json');

      expect(config.verbose).toBe(true);
      expect(config.ignorePackages).toEqual(['test-package']);
      expect(config.packagesDir).toBe('../../packages'); // 默认值
    });
  });
});
