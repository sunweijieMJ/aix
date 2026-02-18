/**
 * VisualTestOrchestrator 单元测试
 *
 * 测试重点：
 * - 目标解析
 * - 空 targets 处理
 * - 错误处理
 * - 资源清理
 * - LLM stats API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VisualTestOrchestrator } from '../../../src/core/orchestrator';
import type { VisualTestConfig } from '../../../src/core/config/schema';

// ---- Hoisted mocks (vi.mock factories are hoisted, so referenced vars must also be hoisted) ----

const {
  mockBaselineProvider,
  mockScreenshotCapture,
  mockScreenshotClose,
  mockScreenshotInit,
} = vi.hoisted(() => ({
  mockBaselineProvider: {
    name: 'local',
    fetch: vi
      .fn()
      .mockResolvedValue({
        path: '/tmp/baseline.png',
        success: true,
        metadata: {},
      }),
    exists: vi.fn().mockResolvedValue(true),
    dispose: vi.fn().mockResolvedValue(undefined),
  },
  mockScreenshotCapture: vi.fn().mockResolvedValue('/tmp/actual.png'),
  mockScreenshotClose: vi.fn().mockResolvedValue(undefined),
  mockScreenshotInit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/core/baseline', () => ({
  createBaselineProvider: vi.fn().mockReturnValue(mockBaselineProvider),
}));

vi.mock('../../../src/core/screenshot/playwright-engine', () => {
  return {
    PlaywrightScreenshotEngine: class {
      initialize = mockScreenshotInit;
      capture = mockScreenshotCapture;
      close = mockScreenshotClose;
    },
  };
});

vi.mock('../../../src/core/comparison/pixel-engine', () => {
  return {
    PixelComparisonEngine: class {
      compare = vi.fn().mockResolvedValue({
        match: true,
        mismatchPercentage: 0,
        mismatchPixels: 0,
        totalPixels: 10000,
        diffPath: null,
        sizeDiff: null,
        diffRegions: [],
      });
    },
  };
});

vi.mock('../../../src/core/llm', () => {
  return {
    LLMAnalyzer: class {
      analyze = vi
        .fn()
        .mockResolvedValue({
          differences: [],
          assessment: {
            matchScore: 100,
            grade: 'A',
            acceptable: true,
            summary: 'OK',
          },
        });
      suggestFix = vi.fn().mockResolvedValue([]);
      reset = vi.fn();
      getStats = vi.fn().mockReturnValue({
        callCount: 0,
        totalTokens: 0,
        estimatedCost: 0,
        averageTokensPerCall: 0,
      });
    },
  };
});

vi.mock('../../../src/core/report', () => ({
  JsonReporter: class {
    name = 'json';
    generate = vi.fn().mockResolvedValue('/tmp/reports/report.json');
  },
  HtmlReporter: class {
    name = 'html';
    generate = vi.fn().mockResolvedValue('/tmp/reports/report.html');
  },
  ConclusionReporter: class {
    name = 'conclusion';
    generate = vi.fn().mockResolvedValue('/tmp/reports/conclusion.json');
    buildReport = vi.fn().mockReturnValue({
      meta: {
        id: 'vt-test',
        generatedAt: '',
        scope: { targets: 0, variants: 0 },
        config: { threshold: 0.01, viewport: { width: 1280, height: 720 } },
      },
      summary: {
        overallScore: 100,
        grade: 'A',
        passed: 0,
        failed: 0,
        keyFindings: [],
        oneLiner: '',
        acceptable: true,
      },
      issues: [],
      fixPlan: {
        totalFixes: 0,
        estimatedHours: 0,
        byPriority: { critical: [], major: [], minor: [] },
      },
      nextActions: [],
    });
  },
}));

vi.mock('../../../src/utils/file', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
  },
}));

/** 创建最小化的 mock config */
function mockConfig(
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
    server: {
      url: 'http://localhost:3000',
      timeout: 60_000,
      autoStart: false,
    },
    screenshot: {
      viewport: { width: 1280, height: 720 },
      viewports: [],
      stability: {
        waitForNetworkIdle: true,
        waitForAnimations: true,
        extraDelay: 500,
        disableAnimations: true,
        hideSelectors: [],
      },
      browsers: [{ type: 'chromium', headless: true }],
    },
    comparison: {
      threshold: 0.01,
      antialiasing: true,
    },
    baseline: {
      provider: 'local',
    },
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
    report: {
      formats: ['html', 'json'],
      conclusion: true,
    },
    ci: {
      failOnDiff: true,
      failOnSeverity: 'major',
    },
    performance: {
      timeout: 120_000,
      concurrent: {
        maxBrowsers: 3,
        maxTargets: 10,
        poolSize: 5,
      },
    },
    logging: {
      level: 'info',
    },
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

describe('VisualTestOrchestrator', () => {
  let orchestrator: VisualTestOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with valid config', () => {
      orchestrator = new VisualTestOrchestrator(mockConfig());
      expect(orchestrator).toBeDefined();
    });
  });

  describe('empty targets', () => {
    it('should return empty array and not initialize screenshot engine', async () => {
      orchestrator = new VisualTestOrchestrator(mockConfig({ targets: [] }));

      const results = await orchestrator.runTests();

      expect(results).toEqual([]);
      // Screenshot engine should NOT be initialized for empty targets
      expect(mockScreenshotInit).not.toHaveBeenCalled();
    });

    it('should return empty when filter matches no targets', async () => {
      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [
                {
                  name: 'default',
                  url: 'http://localhost:3000/button',
                  baseline: 'button.png',
                },
              ],
            },
          ],
        }),
      );

      const results = await orchestrator.runTests(['non-existent']);
      expect(results).toEqual([]);
    });
  });

  describe('test execution', () => {
    it('should run tests and return results for each variant', async () => {
      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [
                {
                  name: 'primary',
                  url: 'http://localhost:3000/button/primary',
                  baseline: 'button-primary.png',
                },
                {
                  name: 'secondary',
                  url: 'http://localhost:3000/button/secondary',
                  baseline: 'button-secondary.png',
                },
              ],
            },
          ],
        }),
      );

      const results = await orchestrator.runTests();

      expect(results).toHaveLength(2);
      expect(results[0]!.target).toBe('button');
      expect(results[0]!.variant).toBe('primary');
      expect(results[1]!.variant).toBe('secondary');
    });

    it('should filter targets by name', async () => {
      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [{ name: 'v1', url: 'http://a', baseline: 'a.png' }],
            },
            {
              name: 'input',
              type: 'component',
              variants: [{ name: 'v1', url: 'http://b', baseline: 'b.png' }],
            },
          ],
        }),
      );

      const results = await orchestrator.runTests(['button']);

      expect(results).toHaveLength(1);
      expect(results[0]!.target).toBe('button');
    });

    it('should create viewport-specific tasks when viewports configured', async () => {
      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          screenshot: {
            viewport: { width: 1280, height: 720 },
            viewports: [
              { name: 'mobile', width: 375, height: 667 },
              { name: 'desktop', width: 1920, height: 1080 },
            ],
            stability: {
              waitForNetworkIdle: true,
              waitForAnimations: true,
              extraDelay: 0,
              disableAnimations: true,
              hideSelectors: [],
            },
            browsers: [{ type: 'chromium', headless: true }],
          },
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [
                { name: 'default', url: 'http://a', baseline: 'a.png' },
              ],
            },
          ],
        }),
      );

      const results = await orchestrator.runTests();

      // 1 variant x 2 viewports = 2 tasks
      expect(results).toHaveLength(2);
      expect(results[0]!.variant).toBe('default@mobile');
      expect(results[1]!.variant).toBe('default@desktop');
    });

    it('should create browser-specific tasks when multiple browsers configured', async () => {
      orchestrator = new VisualTestOrchestrator(
        mockConfig({
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
            browsers: [
              { type: 'chromium', headless: true },
              { type: 'firefox', headless: true },
            ],
          },
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [
                { name: 'default', url: 'http://a', baseline: 'a.png' },
              ],
            },
          ],
        }),
      );

      const results = await orchestrator.runTests();

      // 1 variant x 2 browsers = 2 tasks
      expect(results).toHaveLength(2);
      expect(results[0]!.variant).toBe('default@chromium');
      expect(results[1]!.variant).toBe('default@firefox');
    });

    it('should not add browser suffix when single browser configured', async () => {
      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [
                { name: 'default', url: 'http://a', baseline: 'a.png' },
              ],
            },
          ],
        }),
      );

      const results = await orchestrator.runTests();

      expect(results).toHaveLength(1);
      expect(results[0]!.variant).toBe('default'); // no @chromium suffix
    });
  });

  describe('error handling', () => {
    it('should create error result when baseline fetch fails', async () => {
      mockBaselineProvider.fetch.mockResolvedValueOnce({
        path: '/tmp/baseline.png',
        success: false,
        error: new Error('Baseline not found'),
      });

      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [{ name: 'v1', url: 'http://a', baseline: 'a.png' }],
            },
          ],
        }),
      );

      const results = await orchestrator.runTests();

      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
      expect(results[0]!.mismatchPercentage).toBe(100);
    });

    it('should create error result when screenshot fails', async () => {
      mockScreenshotCapture.mockRejectedValueOnce(new Error('Browser crashed'));

      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [{ name: 'v1', url: 'http://a', baseline: 'a.png' }],
            },
          ],
        }),
      );

      const results = await orchestrator.runTests();

      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
    });

    it('should isolate failures - one task failure does not affect others', async () => {
      mockBaselineProvider.fetch
        .mockResolvedValueOnce({
          path: '/tmp/a.png',
          success: false,
          error: new Error('fail'),
        })
        .mockResolvedValueOnce({
          path: '/tmp/b.png',
          success: true,
          metadata: {},
        });

      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'a',
              type: 'component',
              variants: [{ name: 'v1', url: 'http://a', baseline: 'a.png' }],
            },
            {
              name: 'b',
              type: 'component',
              variants: [{ name: 'v1', url: 'http://b', baseline: 'b.png' }],
            },
          ],
        }),
      );

      const results = await orchestrator.runTests();

      expect(results).toHaveLength(2);
      // One failed, one passed
      const failed = results.find((r) => !r.passed);
      const passed = results.find((r) => r.passed);
      expect(failed).toBeDefined();
      expect(passed).toBeDefined();
    });
  });

  describe('resource cleanup', () => {
    it('should close screenshot engine after test run', async () => {
      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [{ name: 'v1', url: 'http://a', baseline: 'a.png' }],
            },
          ],
        }),
      );

      await orchestrator.runTests();

      expect(mockScreenshotClose).toHaveBeenCalled();
    });

    it('should close screenshot engine even when tests fail', async () => {
      mockScreenshotCapture.mockRejectedValue(new Error('crash'));

      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [{ name: 'v1', url: 'http://a', baseline: 'a.png' }],
            },
          ],
        }),
      );

      await orchestrator.runTests();

      expect(mockScreenshotClose).toHaveBeenCalled();
    });

    it('should dispose baseline provider after test run', async () => {
      orchestrator = new VisualTestOrchestrator(
        mockConfig({
          targets: [
            {
              name: 'button',
              type: 'component',
              variants: [{ name: 'v1', url: 'http://a', baseline: 'a.png' }],
            },
          ],
        }),
      );

      await orchestrator.runTests();

      expect(mockBaselineProvider.dispose).toHaveBeenCalled();
    });
  });

  describe('LLM stats API', () => {
    it('should expose LLM stats with correct structure', () => {
      orchestrator = new VisualTestOrchestrator(mockConfig());

      const stats = orchestrator.getLLMStats();

      expect(stats).toEqual({
        callCount: 0,
        totalTokens: 0,
        estimatedCost: 0,
        averageTokensPerCall: 0,
      });
    });
  });

  describe('updateBaselines', () => {
    it('should skip results with missing paths', async () => {
      orchestrator = new VisualTestOrchestrator(mockConfig());

      const fs = (await import('node:fs/promises')).default;

      await orchestrator.updateBaselines([
        {
          target: 'button',
          variant: 'v1',
          passed: false,
          mismatchPercentage: 10,
          screenshots: { baseline: '', actual: '', diff: null },
          comparison: {
            match: false,
            mismatchPercentage: 10,
            mismatchPixels: 100,
            totalPixels: 1000,
            diffPath: null,
            sizeDiff: null,
            diffRegions: [],
          },
        },
      ]);

      expect(fs.copyFile).not.toHaveBeenCalled();
    });
  });
});
