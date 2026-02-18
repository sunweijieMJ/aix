/**
 * 配置 Schema 验证单元测试
 */

import { describe, it, expect } from 'vitest';
import { configSchema } from '../../../src/core/config/schema';
import { validateConfig } from '../../../src/core/config/loader';

describe('configSchema', () => {
  it('should accept an empty config with all defaults', () => {
    const result = configSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.directories.baselines).toBe('.visual-test/baselines');
      expect(result.data.comparison.threshold).toBe(0.01);
      expect(result.data.baseline.provider).toBe('local');
      expect(result.data.llm.enabled).toBe(true);
    }
  });

  it('should accept a full valid config', () => {
    const config = {
      name: 'test-project',
      directories: {
        baselines: './baselines',
        actuals: './actuals',
        diffs: './diffs',
        reports: './reports',
      },
      server: {
        url: 'http://localhost:5173',
        timeout: 30000,
      },
      screenshot: {
        viewport: { width: 1920, height: 1080 },
        stability: {
          disableAnimations: true,
          extraDelay: 200,
        },
      },
      comparison: {
        threshold: 0.05,
        antialiasing: false,
      },
      baseline: {
        provider: 'local' as const,
      },
      llm: {
        enabled: true,
        model: 'claude-sonnet-4-20250514',
        costControl: {
          maxCallsPerRun: 20,
        },
      },
      targets: [
        {
          name: 'button',
          type: 'component' as const,
          variants: [
            {
              name: 'default',
              url: 'http://localhost:5173/button',
              baseline: './baselines/button-default.png',
            },
          ],
        },
      ],
    };

    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject invalid viewport dimensions', () => {
    const config = {
      screenshot: {
        viewport: { width: -1, height: 0 },
      },
    };

    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid threshold values', () => {
    const config = {
      comparison: {
        threshold: 2.0, // must be 0-1
      },
    };

    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid baseline provider', () => {
    const config = {
      baseline: {
        provider: 'invalid-provider',
      },
    };

    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject targets with empty name', () => {
    const config = {
      targets: [
        {
          name: '',
          variants: [],
        },
      ],
    };

    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should accept structured baseline source in variants', () => {
    const config = {
      targets: [
        {
          name: 'test',
          variants: [
            {
              name: 'default',
              url: 'http://localhost:3000',
              baseline: {
                type: 'figma-mcp' as const,
                source: '123:456',
                fileKey: 'abc',
              },
            },
          ],
        },
      ],
    };

    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should apply default values correctly', () => {
    const result = configSchema.parse({});

    expect(result.screenshot.viewport.width).toBe(1280);
    expect(result.screenshot.viewport.height).toBe(720);
    expect(result.screenshot.stability.disableAnimations).toBe(true);
    expect(result.screenshot.stability.extraDelay).toBe(500);
    expect(result.comparison.threshold).toBe(0.01);
    expect(result.llm.model).toBe('gpt-4o');
    expect(result.llm.costControl.maxCallsPerRun).toBe(50);
    expect(result.report.formats).toEqual(['html', 'json']);
    expect(result.ci.failOnDiff).toBe(true);
  });
});

describe('validateConfig', () => {
  it('should return validated config for valid input', () => {
    const config = validateConfig({});
    expect(config.directories.baselines).toBe('.visual-test/baselines');
    expect(config.comparison.threshold).toBe(0.01);
  });

  it('should throw on invalid config with descriptive message', () => {
    expect(() =>
      validateConfig({
        comparison: { threshold: 5 },
      } as any),
    ).toThrow('配置验证失败');
  });
});
