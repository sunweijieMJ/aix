/**
 * PlaywrightScreenshotEngine 单元测试
 *
 * 使用 mock Playwright Browser/Page/Context 测试引擎逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaywrightScreenshotEngine } from '../../../src/core/screenshot/playwright-engine';
import type { VisualTestConfig } from '../../../src/core/config/schema';

// ---- Mock Playwright (vi.hoisted to avoid TDZ issues with vi.mock hoisting) ----

const { mockPage, mockContext, mockBrowser } = vi.hoisted(() => {
  const _mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    $: vi.fn().mockResolvedValue({
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    }),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    emulateMedia: vi.fn().mockResolvedValue(undefined),
    addStyleTag: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const _mockContext = {
    newPage: vi.fn().mockResolvedValue(_mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const _mockBrowser = {
    newContext: vi.fn().mockResolvedValue(_mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    mockPage: _mockPage,
    mockContext: _mockContext,
    mockBrowser: _mockBrowser,
  };
});

vi.mock('playwright', () => ({
  chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) },
  firefox: { launch: vi.fn().mockResolvedValue(mockBrowser) },
  webkit: { launch: vi.fn().mockResolvedValue(mockBrowser) },
}));

vi.mock('../../../src/utils/file', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
  removeFile: vi.fn().mockResolvedValue(undefined),
}));

function createConfig(
  overrides: Partial<VisualTestConfig> = {},
): VisualTestConfig {
  return {
    name: 'test',
    directories: {
      baselines: '/tmp/baselines',
      actuals: '/tmp/actuals',
      diffs: '/tmp/diffs',
      reports: '/tmp/reports',
    },
    server: { url: 'http://localhost:3000', timeout: 60_000, autoStart: false },
    screenshot: {
      viewport: { width: 1280, height: 720 },
      viewports: [],
      stability: {
        waitForNetworkIdle: true,
        waitForAnimations: true,
        extraDelay: 0,
        disableAnimations: true,
        hideSelectors: [],
      },
      browsers: [{ type: 'chromium', headless: true }],
    },
    comparison: { threshold: 0.01, antialiasing: true },
    baseline: { provider: 'local' },
    llm: {
      enabled: false,
      model: 'gpt-4o',
      analyze: {},
      suggestFix: {},
      costControl: {
        maxCallsPerRun: 50,
        diffThreshold: 5,
        cacheEnabled: true,
        cacheTTL: 3600,
      },
      fallback: {
        onError: 'skip',
        retryAttempts: 2,
        timeout: 30000,
        fallbackToRuleBase: true,
      },
    },
    targets: [],
    report: { formats: ['json'], conclusion: false },
    ci: { failOnDiff: true, failOnSeverity: 'major' },
    performance: {
      timeout: 120_000,
      concurrent: { maxBrowsers: 3, maxTargets: 10, poolSize: 5 },
    },
    logging: { level: 'error' },
    storybook: {
      enabled: false,
      include: ['**'],
      exclude: [],
      defaultSelector: '#storybook-root',
      baselineDir: 'storybook',
    },
    ...overrides,
  } as VisualTestConfig;
}

describe('PlaywrightScreenshotEngine', () => {
  let engine: PlaywrightScreenshotEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new PlaywrightScreenshotEngine(createConfig());
  });

  afterEach(async () => {
    await engine.close();
  });

  describe('initialize', () => {
    it('should launch browser and create context with configured viewport', async () => {
      await engine.initialize();

      const { chromium } = await import('playwright');
      expect(chromium.launch).toHaveBeenCalledWith({
        headless: true,
        channel: undefined,
      });
      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        viewport: { width: 1280, height: 720 },
      });
    });

    it('should skip already initialized browser types', async () => {
      await engine.initialize();
      await engine.initialize();

      const { chromium } = await import('playwright');
      expect(chromium.launch).toHaveBeenCalledTimes(1);
    });
  });

  describe('capture', () => {
    it('should navigate to URL and take screenshot', async () => {
      await engine.initialize();

      await engine.capture({
        url: 'http://localhost:3000/button',
        outputPath: '/tmp/actuals/button.png',
      });

      expect(mockPage.goto).toHaveBeenCalledWith(
        'http://localhost:3000/button',
        expect.objectContaining({ waitUntil: 'networkidle' }),
      );
      expect(mockPage.screenshot).toHaveBeenCalled();
    });

    it('should set custom viewport when specified', async () => {
      await engine.initialize();

      await engine.capture({
        url: 'http://localhost:3000/button',
        outputPath: '/tmp/test.png',
        viewport: { width: 375, height: 667 },
      });

      expect(mockPage.setViewportSize).toHaveBeenCalledWith({
        width: 375,
        height: 667,
      });
    });

    it('should reset viewport after capture', async () => {
      await engine.initialize();

      await engine.capture({
        url: 'http://localhost:3000/button',
        outputPath: '/tmp/test.png',
        viewport: { width: 375, height: 667 },
      });

      // Should reset to default viewport in finally block
      const calls = mockPage.setViewportSize.mock.calls;
      expect(calls[calls.length - 1]).toEqual([{ width: 1280, height: 720 }]);
    });

    it('should set theme (color scheme) when specified', async () => {
      await engine.initialize();

      await engine.capture({
        url: 'http://localhost:3000/button',
        outputPath: '/tmp/test.png',
        theme: 'dark',
      });

      expect(mockPage.emulateMedia).toHaveBeenCalledWith({
        colorScheme: 'dark',
      });
    });

    it('should reset theme after capture', async () => {
      await engine.initialize();

      await engine.capture({
        url: 'http://localhost:3000/button',
        outputPath: '/tmp/test.png',
        theme: 'dark',
      });

      // Last emulateMedia call should reset to null
      const calls = mockPage.emulateMedia.mock.calls;
      expect(calls[calls.length - 1]).toEqual([{ colorScheme: null }]);
    });

    it('should throw error when browser not initialized', async () => {
      await expect(
        engine.capture({
          url: 'http://localhost:3000/button',
          outputPath: '/tmp/test.png',
        }),
      ).rejects.toThrow('not initialized');
    });
  });

  describe('retry logic', () => {
    it('should retry screenshot on retryable error', async () => {
      await engine.initialize();

      mockPage.goto
        .mockRejectedValueOnce(new Error('net::err_connection_refused'))
        .mockResolvedValueOnce(undefined);

      await engine.capture({
        url: 'http://localhost:3000/button',
        outputPath: '/tmp/test.png',
      });

      // goto called twice: once failed, once succeeded
      expect(mockPage.goto.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should not retry on non-retryable error', async () => {
      await engine.initialize();

      mockPage.goto.mockRejectedValue(new Error('some non-retryable error'));

      await expect(
        engine.capture({
          url: 'http://localhost:3000/button',
          outputPath: '/tmp/test.png',
        }),
      ).rejects.toThrow('some non-retryable error');
    });

    it('should respect max retry attempts', async () => {
      await engine.initialize();

      mockPage.goto.mockRejectedValue(new Error('timeout waiting for'));

      await expect(
        engine.capture({
          url: 'http://localhost:3000/button',
          outputPath: '/tmp/test.png',
        }),
      ).rejects.toThrow('timeout');

      // goto is called for navigation + PagePool reset (about:blank), so count navigation calls
      const navCalls = mockPage.goto.mock.calls.filter(
        (c: unknown[]) => c[0] !== 'about:blank',
      );
      expect(navCalls.length).toBe(3);
    });
  });

  describe('resource cleanup', () => {
    it('should close browser, context and drain pools on close', async () => {
      await engine.initialize();
      await engine.close();

      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle concurrent close calls safely', async () => {
      await engine.initialize();

      // Call close twice concurrently
      const [r1, r2] = await Promise.allSettled([
        engine.close(),
        engine.close(),
      ]);

      expect(r1.status).toBe('fulfilled');
      expect(r2.status).toBe('fulfilled');
      // Browser close should only be called once
      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });
  });
});
