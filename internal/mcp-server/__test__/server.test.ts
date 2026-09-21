import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpServer } from '../src/server/index';
import { LogLevel, cliLogger } from '../src/utils/logger';

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

    await writeFile(join(testDataDir, 'components-index.json'), JSON.stringify(mockIndex, null, 2));

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
      expect(stats).toHaveProperty('monitoringStats');
      expect(stats).toHaveProperty('lastUpdated');
    });
  });

  describe('监控指标接线', () => {
    it('工具调用应该计入请求总数、成功率和错误数', async () => {
      await server.start();

      // McpServer 只在 start() 里接 stdio，没有注入 transport 的入口；
      // 这里直接拿内部的 SDK server 建一条内存连接，为的是走通真实的
      // tools/call 回调——请求计数就埋在那个回调里，绕过它就测不到
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await (
        server as unknown as { server: { connect: (t: unknown) => Promise<void> } }
      ).server.connect(serverTransport);

      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);

      await client.callTool({ name: 'list-components', arguments: {} });

      let stats = server.getStats();
      expect(stats.monitoringStats.totalRequests).toBe(1);
      expect(stats.monitoringStats.successRate).toBe('100.00%');

      // 工具内部抛错同样要计数，并且算作失败
      const failed = await client.callTool({
        name: 'get-icon-svg',
        arguments: { name: 'NotExistIcon' },
      });
      expect(failed.isError).toBe(true);

      stats = server.getStats();
      expect(stats.monitoringStats.totalRequests).toBe(2);
      expect(stats.monitoringStats.successRate).toBe('50.00%');
      expect(stats.monitoringStats.totalErrors).toBe(1);

      await client.close();
    });
  });

  describe('verbose 开关', () => {
    it('默认 INFO，MCP_VERBOSE=true 时降到 DEBUG', () => {
      // 这个开关以前只被读进配置就没有下文，日志级别恒为 DEBUG
      expect(cliLogger.getLevel()).toBe(LogLevel.INFO);

      process.env.MCP_VERBOSE = 'true';
      try {
        new McpServer(testDataDir, true);
        expect(cliLogger.getLevel()).toBe(LogLevel.DEBUG);
      } finally {
        delete process.env.MCP_VERBOSE;
        cliLogger.setLevel(LogLevel.INFO);
      }
    });
  });

  describe('refreshComponentIndex', () => {
    it('should refresh component index', async () => {
      await server.start();
      await expect(server.refreshComponentIndex()).resolves.not.toThrow();
    });
  });
});
