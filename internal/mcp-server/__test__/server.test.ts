import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpServer } from '../src/server/index';

describe('McpServer', () => {
  let server: McpServer;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = join(process.cwd(), 'test-data');
    await mkdir(testDataDir, { recursive: true });

    // 创建测试数据
    const mockIndex = {
      components: [
        {
          name: 'TestComponent',
          packageName: '@aix/test-component',
          version: '1.0.0',
          description: '测试组件',
          category: '测试',
          tags: ['test'],
          author: 'Test Author',
          license: 'MIT',
          sourcePath: '/test/path',
          dependencies: [],
          peerDependencies: [],
          props: [],
          examples: [],
        },
      ],
      categories: ['测试'],
      tags: ['test'],
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
    };

    await writeFile(
      join(testDataDir, 'components-index.json'),
      JSON.stringify(mockIndex, null, 2),
    );

    server = new McpServer(testDataDir, true); // 测试模式
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    await rm(testDataDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create server instance', () => {
      expect(server).toBeDefined();
    });
  });

  describe('start', () => {
    it('should start server in test mode', async () => {
      await expect(server.start()).resolves.not.toThrow();
    });

    it('should load component index', async () => {
      await server.start();
      const stats = server.getStats();
      expect(stats.componentsLoaded).toBe(1);
      expect(stats.toolsAvailable).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return server statistics', async () => {
      await server.start();
      const stats = server.getStats();

      expect(stats).toHaveProperty('componentsLoaded');
      expect(stats).toHaveProperty('toolsAvailable');
      expect(stats).toHaveProperty('cacheStats');
      expect(stats).toHaveProperty('lastUpdated');
    });
  });

  describe('refreshComponentIndex', () => {
    it('should refresh component index', async () => {
      await server.start();
      await expect(server.refreshComponentIndex()).resolves.not.toThrow();
    });
  });
});
