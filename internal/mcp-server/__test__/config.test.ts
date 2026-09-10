import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigManager, createConfigManager, DEFAULT_CONFIG } from '../src/config/index';

/**
 * ConfigManager 测试
 *
 * 此前这个文件在内部自己定义了一个同名 ConfigManager 类（带 loadConfig /
 * saveConfig / mergeConfigs 等 src 里根本不存在的方法）并对它断言，
 * 真实的 ConfigManager 覆盖率为零。
 */
describe('ConfigManager', () => {
  const envKeys = ['MCP_DATA_DIR', 'MCP_PACKAGES_DIR', 'MCP_VERBOSE'] as const;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    envKeys.forEach((k) => delete process.env[k]);
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe('默认配置', () => {
    it('应该只包含实际被消费的字段', () => {
      expect(Object.keys(DEFAULT_CONFIG).sort()).toEqual([
        'dataDir',
        'ignorePackages',
        'packagesDir',
        'serverName',
        'serverVersion',
        'verbose',
      ]);
    });

    it('路径应该是绝对路径', () => {
      expect(DEFAULT_CONFIG.dataDir).toBe(resolve(DEFAULT_CONFIG.dataDir));
      expect(DEFAULT_CONFIG.packagesDir).toBe(resolve(DEFAULT_CONFIG.packagesDir));
    });

    it('getAll 应该返回副本，改动不回写内部状态', () => {
      const manager = new ConfigManager();
      const snapshot = manager.getAll();
      snapshot.dataDir = '/mutated';

      expect(manager.get('dataDir')).not.toBe('/mutated');
    });
  });

  describe('配置优先级', () => {
    it('显式传入 > 环境变量 > 默认值', () => {
      process.env.MCP_DATA_DIR = '/env/data';
      process.env.MCP_PACKAGES_DIR = '/env/packages';

      const manager = new ConfigManager({ dataDir: '/explicit/data' });

      expect(manager.get('dataDir')).toBe('/explicit/data');
      expect(manager.get('packagesDir')).toBe('/env/packages');
      expect(manager.get('serverName')).toBe(DEFAULT_CONFIG.serverName);
    });

    it('环境变量里的相对路径应该被解析成绝对路径', () => {
      process.env.MCP_DATA_DIR = './relative-data';

      expect(new ConfigManager().get('dataDir')).toBe(resolve('./relative-data'));
    });

    it('MCP_VERBOSE 只在显式为 true 时生效', () => {
      process.env.MCP_VERBOSE = 'false';
      expect(new ConfigManager().get('verbose')).toBe(false);

      process.env.MCP_VERBOSE = 'true';
      expect(new ConfigManager().get('verbose')).toBe(true);
    });
  });

  describe('set / merge', () => {
    it('set 应该更新单个字段', () => {
      const manager = new ConfigManager();
      manager.set('verbose', true);
      expect(manager.get('verbose')).toBe(true);
    });

    it('merge 应该只覆盖传入的字段', () => {
      const manager = new ConfigManager({ dataDir: '/a', packagesDir: '/b' });
      manager.merge({ dataDir: '/c' });

      expect(manager.get('dataDir')).toBe('/c');
      expect(manager.get('packagesDir')).toBe('/b');
    });
  });

  describe('validate', () => {
    let existingDir: string;

    beforeEach(async () => {
      existingDir = await mkdtemp(join(tmpdir(), 'aix-mcp-config-'));
    });

    afterEach(async () => {
      await rm(existingDir, { recursive: true, force: true });
    });

    it('默认配置必须能通过校验', async () => {
      // 回归用例：serverName 的格式校验曾让默认配置永远 isValid=false
      const result = await new ConfigManager().validate();
      expect(result.errors).toEqual([]);
      expect(result.isValid).toBe(true);
    });

    it('目录都存在时不应产生警告', async () => {
      const manager = new ConfigManager({ dataDir: existingDir, packagesDir: existingDir });
      const result = await manager.validate();

      expect(result.isValid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('数据目录缺失只警告，不阻断启动', async () => {
      const manager = new ConfigManager({ dataDir: join(existingDir, 'nope') });
      const result = await manager.validate();

      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.includes('请先运行 extract'))).toBe(true);
    });

    it('缺少必需字段应该报错', async () => {
      const manager = new ConfigManager({ dataDir: '', packagesDir: '' });
      const result = await manager.validate();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('dataDir 是必需的');
      expect(result.errors).toContain('packagesDir 是必需的');
    });
  });

  it('createConfigManager 应该返回 ConfigManager 实例', () => {
    expect(createConfigManager()).toBeInstanceOf(ConfigManager);
  });
});
