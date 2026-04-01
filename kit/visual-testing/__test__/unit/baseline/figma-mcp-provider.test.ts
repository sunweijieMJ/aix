/**
 * FigmaMcpProvider 单元测试
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { FigmaMcpProvider } from '../../../src/core/baseline/figma-mcp-provider';

// Mock file utils
vi.mock('../../../src/utils/file', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
  pathExists: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../src/utils/hash', () => ({
  hashFile: vi.fn().mockResolvedValue('abc123'),
}));

vi.mock('../../../src/utils/image', () => ({
  getImageDimensions: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
}));

describe('FigmaMcpProvider', () => {
  let provider: FigmaMcpProvider;

  // Mock initMcpClient to fail fast instead of spawning real MCP processes
  vi.spyOn(
    FigmaMcpProvider.prototype as any,
    'initMcpClient',
  ).mockRejectedValue(new Error('MCP SDK not available in test'));

  afterEach(async () => {
    if (provider) {
      await provider.dispose();
    }
  });

  describe('initialization', () => {
    it('should initialize with default options', () => {
      provider = new FigmaMcpProvider();
      expect(provider.name).toBe('figma-mcp');
    });

    it('should initialize with fileKey', () => {
      provider = new FigmaMcpProvider({ fileKey: 'test-file-key' });
      expect(provider.name).toBe('figma-mcp');
    });

    it('should register process exit handler', () => {
      const spy = vi.spyOn(process, 'on');
      provider = new FigmaMcpProvider();
      expect(spy).toHaveBeenCalledWith('exit', expect.any(Function));
      spy.mockRestore();
    });
  });

  describe('fetch', () => {
    it('should return error when fileKey is missing', async () => {
      provider = new FigmaMcpProvider(); // no fileKey

      const result = await provider.fetch({
        source: 'node-123', // no fileKey in source either
        outputPath: '/tmp/output.png',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('fileKey is required');
    });

    it('should return error when MCP client fails to initialize', async () => {
      provider = new FigmaMcpProvider({ fileKey: 'test-key' });

      const result = await provider.fetch({
        source: 'node-123',
        outputPath: '/tmp/output.png',
      });

      // Will fail because MCP SDK is not available in test
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should parse fileKey:nodeId format from source string', async () => {
      // 直接测试 parseSource 逻辑：通过不提供 defaultFileKey，
      // 验证 fileKey 是否从 source 字符串中正确解析
      provider = new FigmaMcpProvider(); // 无 defaultFileKey

      // "myFileKey:123:456" 应解析为 fileKey="myFileKey", nodeId="123:456"
      // 由于 parseSource 正确提取了 fileKey，不会触发 "fileKey is required" 错误
      const result = await provider.fetch({
        source: 'myFileKey:123:456',
        outputPath: '/tmp/output.png',
      });

      // 应因 MCP 初始化失败而失败，而非因 fileKey 缺失
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).not.toContain('fileKey is required');
      expect(result.error!.message).toContain('MCP');
    });

    it('should parse simple fileKey:nodeId without nested colons', async () => {
      provider = new FigmaMcpProvider(); // 无 defaultFileKey

      // "myFileKey:simpleNode" 应解析为 fileKey="myFileKey", nodeId="simpleNode"
      const result = await provider.fetch({
        source: 'myFileKey:simpleNode',
        outputPath: '/tmp/output.png',
      });

      expect(result.success).toBe(false);
      expect(result.error!.message).not.toContain('fileKey is required');
    });
  });

  describe('exists check', () => {
    it('should return false when fileKey is missing', async () => {
      provider = new FigmaMcpProvider();
      const exists = await provider.exists('node-123');
      expect(exists).toBe(false);
    });

    it('should return false when MCP client fails', async () => {
      provider = new FigmaMcpProvider({ fileKey: 'test-key' });
      const exists = await provider.exists('node-123');
      // MCP SDK not available, should return false without throwing
      expect(exists).toBe(false);
    });

    it('should parse object source format', async () => {
      provider = new FigmaMcpProvider({ fileKey: 'default-key' });
      const exists = await provider.exists({
        type: 'figma-mcp',
        source: '123:456',
        fileKey: 'other-key',
      });
      expect(exists).toBe(false); // MCP not available
    });
  });

  describe('resource cleanup', () => {
    it('should remove process exit handler on dispose', async () => {
      const removeSpy = vi.spyOn(process, 'removeListener');
      provider = new FigmaMcpProvider();

      await provider.dispose();

      expect(removeSpy).toHaveBeenCalledWith('exit', expect.any(Function));
      removeSpy.mockRestore();
    });

    it('should handle multiple dispose calls safely', async () => {
      provider = new FigmaMcpProvider();

      await provider.dispose();
      await provider.dispose(); // Should not throw

      expect(true).toBe(true); // No error means success
    });

    it('should set disposed flag after successful dispose', async () => {
      provider = new FigmaMcpProvider();

      await provider.dispose();

      // Second call should be a no-op (disposed flag prevents re-entry)
      const removeSpy = vi.spyOn(process, 'removeListener');
      await provider.dispose();
      // removeListener should NOT be called again since dispose already completed
      expect(removeSpy).not.toHaveBeenCalled();
      removeSpy.mockRestore();
    });
  });
});
