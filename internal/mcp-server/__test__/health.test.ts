import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ServerConfig } from '../src/config/index';
import {
  formatHealthCheckResult,
  MonitoringManager,
} from '../src/utils/monitoring';

describe('Health Checker', () => {
  const testDataDir = join(process.cwd(), 'test-tmp');
  const testConfig: ServerConfig = {
    dataDir: testDataDir,
    cacheDir: join(testDataDir, '.cache'),
    packagesDir: join(testDataDir, 'packages'),
    cacheTTL: 3600000,
    enableCache: true,
    maxCacheSize: 100,
    maxConcurrentExtraction: 5,
    extractionTimeout: 30000,
    serverName: 'test-server',
    serverVersion: '1.0.0',
    verbose: false,
    features: {
      enablePrompts: true,
      enableExamples: true,
      enableChangelog: true,
      enableDependencyAnalysis: true,
    },
    ignorePackages: [],
    ignorePatterns: [],
  };

  beforeEach(async () => {
    // 清理测试目录
    await rm(testDataDir, { recursive: true, force: true });
  });

  describe('HealthChecker', () => {
    it('应该创建健康检查器实例', () => {
      const checker = new MonitoringManager(testConfig);
      expect(checker).toBeInstanceOf(MonitoringManager);
    });

    it('应该检测 Node.js 版本', async () => {
      const checker = new MonitoringManager(testConfig);

      // 使用反射访问私有方法进行测试
      const checkNodeVersion = (checker as any).checkNodeVersion.bind(checker);
      const result = await checkNodeVersion();

      expect(result).toHaveProperty('name', 'Node.js 版本');
      expect(result).toHaveProperty('status');
      expect(['pass', 'warn', 'fail']).toContain(result.status);
      expect(result).toHaveProperty('message');
      expect(result.details).toHaveProperty('version');
    });

    it('应该检测数据目录不存在的情况', async () => {
      const checker = new MonitoringManager(testConfig);

      const checkDataDirectory = (checker as any).checkDataDirectory.bind(
        checker,
      );
      const result = await checkDataDirectory();

      expect(result).toHaveProperty('name', '数据目录');
      expect(result.status).toBe('fail');
      expect(result.message).toContain('数据目录不可访问');
    });

    it('应该检测数据目录存在的情况', async () => {
      // 创建测试目录
      await mkdir(testDataDir, { recursive: true });

      const checker = new MonitoringManager(testConfig);
      const checkDataDirectory = (checker as any).checkDataDirectory.bind(
        checker,
      );
      const result = await checkDataDirectory();

      expect(result).toHaveProperty('name', '数据目录');
      expect(result.status).toBe('pass');
      expect(result.message).toContain('数据目录可访问');
    });

    it('应该检测组件索引不存在的情况', async () => {
      await mkdir(testDataDir, { recursive: true });

      const checker = new MonitoringManager(testConfig);
      const checkComponentIndex = (checker as any).checkComponentIndex.bind(
        checker,
      );
      const result = await checkComponentIndex();

      expect(result).toHaveProperty('name', '组件索引');
      expect(result.status).toBe('warn');
      expect(result.message).toContain('组件索引文件不存在');
    });

    it('应该检测有效的组件索引', async () => {
      await mkdir(testDataDir, { recursive: true });

      const indexData = {
        components: [
          {
            name: 'TestComponent',
            packageName: '@test/component',
            version: '1.0.0',
            description: 'Test component',
            category: 'Test',
            tags: ['test'],
            author: 'Test',
            license: 'MIT',
            sourcePath: '/test',
            dependencies: [],
            peerDependencies: [],
            props: [],
            examples: [],
          },
        ],
        categories: ['Test'],
        tags: ['test'],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0',
      };

      await writeFile(
        join(testDataDir, 'components-index.json'),
        JSON.stringify(indexData),
      );

      const checker = new MonitoringManager(testConfig);
      const checkComponentIndex = (checker as any).checkComponentIndex.bind(
        checker,
      );
      const result = await checkComponentIndex();

      expect(result).toHaveProperty('name', '组件索引');
      expect(result.status).toBe('pass');
      expect(result.message).toContain('组件索引正常');
      expect(result.details).toHaveProperty('componentsCount', 1);
    });

    it('应该检测空的组件索引', async () => {
      await mkdir(testDataDir, { recursive: true });

      const indexData = {
        components: [],
        categories: [],
        tags: [],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0',
      };

      await writeFile(
        join(testDataDir, 'components-index.json'),
        JSON.stringify(indexData),
      );

      const checker = new MonitoringManager(testConfig);
      const checkComponentIndex = (checker as any).checkComponentIndex.bind(
        checker,
      );
      const result = await checkComponentIndex();

      expect(result).toHaveProperty('name', '组件索引');
      expect(result.status).toBe('warn');
      expect(result.message).toContain('组件索引为空');
    });

    it('应该检测损坏的组件索引', async () => {
      await mkdir(testDataDir, { recursive: true });

      // 写入无效的 JSON
      await writeFile(
        join(testDataDir, 'components-index.json'),
        'invalid json',
      );

      const checker = new MonitoringManager(testConfig);
      const checkComponentIndex = (checker as any).checkComponentIndex.bind(
        checker,
      );
      const result = await checkComponentIndex();

      expect(result).toHaveProperty('name', '组件索引');
      expect(result.status).toBe('fail');
      expect(result.message).toContain('组件索引文件损坏');
    });

    it('应该检测内存使用情况', async () => {
      const checker = new MonitoringManager(testConfig);
      const checkMemoryUsage = (checker as any).checkMemoryUsage.bind(checker);
      const result = await checkMemoryUsage();

      expect(result).toHaveProperty('name', '内存使用');
      expect(['pass', 'warn']).toContain(result.status);
      expect(result.message).toMatch(/(内存使用正常|内存使用率较高)/);
      expect(result.details).toHaveProperty('heapUsed');
      expect(result.details).toHaveProperty('heapTotal');
    });

    it('应该执行完整的健康检查', async () => {
      await mkdir(testDataDir, { recursive: true });
      await mkdir(join(testDataDir, 'packages'), { recursive: true });

      const checker = new MonitoringManager(testConfig);
      const result = await checker.performHealthCheck();

      expect(result).toHaveProperty('status');
      expect(['healthy', 'warning', 'error']).toContain(result.status);
      expect(result).toHaveProperty('checks');
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('total');
      expect(result.summary).toHaveProperty('passed');
      expect(result.summary).toHaveProperty('failed');
      expect(result.summary).toHaveProperty('warnings');
    });

    it('应该执行快速健康检查', async () => {
      await mkdir(testDataDir, { recursive: true });
      await mkdir(join(testDataDir, 'packages'), { recursive: true });

      const checker = new MonitoringManager(testConfig);
      const result = await checker.quickHealthCheck();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('checks');
      expect(result.checks.length).toBeLessThan(7); // 快速检查应该少于完整检查
      expect(result).toHaveProperty('summary');
    });
  });

  describe('formatHealthCheckResult', () => {
    it('应该格式化健康的检查结果', () => {
      const result = {
        status: 'healthy' as const,
        checks: [
          {
            name: '测试检查',
            status: 'pass' as const,
            message: '检查通过',
          },
        ],
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          warnings: 0,
        },
      };

      const formatted = formatHealthCheckResult(result);
      expect(formatted).toContain('✅ 健康检查 - HEALTHY');
      expect(formatted).toContain('📊 检查摘要:');
      expect(formatted).toContain('总计: 1');
      expect(formatted).toContain('通过: 1');
      expect(formatted).toContain('📋 详细结果:');
      expect(formatted).toContain('✅ 测试检查: 检查通过');
    });

    it('应该格式化有警告的检查结果', () => {
      const result = {
        status: 'warning' as const,
        checks: [
          {
            name: '测试检查',
            status: 'warn' as const,
            message: '检查有警告',
          },
        ],
        summary: {
          total: 1,
          passed: 0,
          failed: 0,
          warnings: 1,
        },
      };

      const formatted = formatHealthCheckResult(result);
      expect(formatted).toContain('⚠️ 健康检查 - WARNING');
      expect(formatted).toContain('警告: 1');
      expect(formatted).toContain('⚠️ 测试检查: 检查有警告');
    });

    it('应该格式化有错误的检查结果', () => {
      const result = {
        status: 'error' as const,
        checks: [
          {
            name: '测试检查',
            status: 'fail' as const,
            message: '检查失败',
          },
        ],
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          warnings: 0,
        },
      };

      const formatted = formatHealthCheckResult(result);
      expect(formatted).toContain('❌ 健康检查 - ERROR');
      expect(formatted).toContain('失败: 1');
      expect(formatted).toContain('❌ 测试检查: 检查失败');
    });
  });
});
