/**
 * StabilityHandler 单元测试
 *
 * 使用 mock Page 测试稳定性处理逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StabilityHandler } from '../../../src/core/screenshot/stability-handler';
import type { StabilityConfig } from '../../../src/types/screenshot';

// ---- Mock dependencies ----

vi.mock('pngjs', () => ({
  PNG: {
    sync: {
      read: vi.fn().mockReturnValue({
        width: 100,
        height: 100,
        data: new Uint8Array(100 * 100 * 4),
      }),
    },
  },
}));

vi.mock('pixelmatch', () => ({
  default: vi.fn().mockReturnValue(0),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue(Buffer.alloc(100)),
    copyFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/utils/file', () => ({
  removeFile: vi.fn().mockResolvedValue(undefined),
}));

function createMockPage() {
  return {
    addStyleTag: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue({
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake')),
    }),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake')),
  } as any;
}

function createConfig(
  overrides: Partial<StabilityConfig> = {},
): StabilityConfig {
  return {
    waitForNetworkIdle: false,
    waitForAnimations: false,
    extraDelay: 0,
    disableAnimations: false,
    hideSelectors: [],
    ...overrides,
  };
}

describe('StabilityHandler', () => {
  let mockPage: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = createMockPage();
  });

  describe('stabilizePage', () => {
    it('should disable animations when configured', async () => {
      const handler = new StabilityHandler(
        createConfig({ disableAnimations: true }),
      );
      await handler.stabilizePage(mockPage);

      expect(mockPage.addStyleTag).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('animation-duration: 0s'),
        }),
      );
    });

    it('should not disable animations when not configured', async () => {
      const handler = new StabilityHandler(
        createConfig({ disableAnimations: false }),
      );
      await handler.stabilizePage(mockPage);

      expect(mockPage.addStyleTag).not.toHaveBeenCalled();
    });

    it('should wait for network idle when configured', async () => {
      const handler = new StabilityHandler(
        createConfig({ waitForNetworkIdle: true }),
      );
      await handler.stabilizePage(mockPage);

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle', {
        timeout: 10_000,
      });
    });

    it('should wait for animations to complete when configured', async () => {
      const handler = new StabilityHandler(
        createConfig({ waitForAnimations: true }),
      );
      await handler.stabilizePage(mockPage);

      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('should apply extra delay when configured', async () => {
      const handler = new StabilityHandler(createConfig({ extraDelay: 500 }));
      await handler.stabilizePage(mockPage);

      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(500);
    });

    it('should not apply extra delay when set to 0', async () => {
      const handler = new StabilityHandler(createConfig({ extraDelay: 0 }));
      await handler.stabilizePage(mockPage);

      expect(mockPage.waitForTimeout).not.toHaveBeenCalled();
    });

    it('should hide specified selectors', async () => {
      const handler = new StabilityHandler(
        createConfig({ hideSelectors: ['.ad-banner', '.clock'] }),
      );
      await handler.stabilizePage(mockPage);

      expect(mockPage.evaluate).toHaveBeenCalledTimes(2);
    });

    it('should mask specified selectors', async () => {
      const handler = new StabilityHandler(
        createConfig({ maskSelectors: ['.dynamic-content'] }),
      );
      await handler.stabilizePage(mockPage);

      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('should replace specified selector content', async () => {
      const handler = new StabilityHandler(
        createConfig({
          replaceSelectors: [
            { selector: '.timestamp', replacement: '2024-01-01' },
          ],
        }),
      );
      await handler.stabilizePage(mockPage);

      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function), {
        sel: '.timestamp',
        text: '2024-01-01',
      });
    });

    it('should execute custom wait strategies', async () => {
      const handler = new StabilityHandler(
        createConfig({
          waitStrategies: [
            { type: 'selector', selector: '.loaded', state: 'visible' },
            { type: 'timeout', duration: 1000 },
          ],
        }),
      );
      await handler.stabilizePage(mockPage);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.loaded', {
        state: 'visible',
        timeout: 10_000,
      });
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);
    });

    it('should handle network idle timeout gracefully', async () => {
      mockPage.waitForLoadState.mockRejectedValueOnce(new Error('Timeout'));

      const handler = new StabilityHandler(
        createConfig({ waitForNetworkIdle: true }),
      );

      // Should not throw
      await handler.stabilizePage(mockPage);
    });

    it('should handle animation wait failure gracefully', async () => {
      mockPage.evaluate.mockRejectedValueOnce(new Error('Evaluation failed'));

      const handler = new StabilityHandler(
        createConfig({ waitForAnimations: true }),
      );

      // Should not throw
      await handler.stabilizePage(mockPage);
    });
  });

  describe('captureWithRetry', () => {
    it('should take single screenshot when no retry config', async () => {
      const handler = new StabilityHandler(createConfig());

      await handler.captureWithRetry(mockPage, '/tmp/output.png', {});

      expect(mockPage.screenshot).toHaveBeenCalledTimes(1);
    });

    it('should take single screenshot when attempts <= 1', async () => {
      const handler = new StabilityHandler(
        createConfig({
          retry: {
            attempts: 1,
            compareInterval: 200,
            consistencyThreshold: 0.001,
          },
        }),
      );

      await handler.captureWithRetry(
        mockPage,
        '/tmp/output.png',
        {},
        { attempts: 1, compareInterval: 200, consistencyThreshold: 0.001 },
      );

      expect(mockPage.screenshot).toHaveBeenCalledTimes(1);
    });

    it('should take multiple screenshots for consistency check', async () => {
      const handler = new StabilityHandler(createConfig());

      await handler.captureWithRetry(
        mockPage,
        '/tmp/output.png',
        {},
        { attempts: 3, compareInterval: 100, consistencyThreshold: 0.001 },
      );

      // Should take 3 screenshots
      expect(mockPage.screenshot).toHaveBeenCalledTimes(3);
    });

    it('should wait compareInterval between screenshots', async () => {
      const handler = new StabilityHandler(createConfig());

      await handler.captureWithRetry(
        mockPage,
        '/tmp/output.png',
        {},
        { attempts: 3, compareInterval: 200, consistencyThreshold: 0.001 },
      );

      // waitForTimeout called between shots (attempts-1 times)
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(200);
      expect(mockPage.waitForTimeout).toHaveBeenCalledTimes(2);
    });

    it('should use element screenshot when selector provided', async () => {
      const handler = new StabilityHandler(createConfig());
      const elScreenshot = vi.fn().mockResolvedValue(Buffer.from('fake'));
      mockPage.$.mockResolvedValue({ screenshot: elScreenshot });

      await handler.captureWithRetry(mockPage, '/tmp/output.png', {
        selector: '.button',
      });

      expect(mockPage.$).toHaveBeenCalledWith('.button');
      expect(elScreenshot).toHaveBeenCalled();
    });

    it('should throw when selector not found', async () => {
      const handler = new StabilityHandler(createConfig());
      mockPage.$.mockResolvedValue(null);

      await expect(
        handler.captureWithRetry(mockPage, '/tmp/output.png', {
          selector: '.missing',
        }),
      ).rejects.toThrow('Selector not found: .missing');
    });

    it('should throw when screenshots not consistent after retries', async () => {
      const pixelmatch = (await import('pixelmatch'))
        .default as unknown as ReturnType<typeof vi.fn>;
      pixelmatch.mockReturnValue(5000); // High diff = inconsistent

      const handler = new StabilityHandler(createConfig());

      await expect(
        handler.captureWithRetry(
          mockPage,
          '/tmp/output.png',
          {},
          { attempts: 2, compareInterval: 100, consistencyThreshold: 0.001 },
        ),
      ).rejects.toThrow('Screenshots not consistent');
    });
  });
});
