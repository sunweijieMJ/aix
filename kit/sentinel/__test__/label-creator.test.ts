import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    step: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { createLabels } from '../src/core/label-creator.js';
import { logger } from '../src/utils/logger.js';
import type { PlatformAdapter } from '../src/platform/types.js';

function createMockAdapter(
  overrides?: Partial<PlatformAdapter>,
): PlatformAdapter {
  return {
    platform: 'github',
    getPipelineDir: (target: string) => `${target}/.github/workflows`,
    getTemplatePath: (baseName: string) => `github/${baseName}`,
    getDestFileName: (baseName: string) => baseName,
    isCliInstalled: () => true,
    getCliInstallHint: () => '',
    getExistingPipelineFiles: () => [],
    createLabel: vi.fn(),
    listSecrets: vi.fn(async () => []),
    listVariables: vi.fn(async () => []),
    getPostInstallInstructions: () => null,
    ...overrides,
  };
}

describe('createLabels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create all labels successfully', async () => {
    const adapter = createMockAdapter();

    const result = await createLabels(
      ['sentinel', 'bot'],
      '/tmp/test-repo',
      false,
      adapter,
    );

    expect(result).toEqual(['sentinel', 'bot']);
    expect(adapter.createLabel).toHaveBeenCalledTimes(2);
  });

  it('should continue creating remaining labels when one fails', async () => {
    const mockCreateLabel = vi
      .fn()
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce(undefined);

    const adapter = createMockAdapter({ createLabel: mockCreateLabel });

    const result = await createLabels(
      ['sentinel', 'bot'],
      '/tmp/test-repo',
      false,
      adapter,
    );

    expect(result).toEqual(['bot']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/sentinel.*失败/),
    );
  });

  it('should not call adapter.createLabel in dry-run mode', async () => {
    const adapter = createMockAdapter();

    const result = await createLabels(
      ['sentinel', 'bot'],
      '/tmp/test-repo',
      true,
      adapter,
    );

    expect(result).toEqual(['sentinel', 'bot']);
    expect(adapter.createLabel).not.toHaveBeenCalled();
  });

  it('should use default color #666666 for unknown labels', async () => {
    const adapter = createMockAdapter();

    await createLabels(['unknown-label'], '/tmp/test-repo', false, adapter);

    expect(adapter.createLabel).toHaveBeenCalledWith(
      'unknown-label',
      '666666',
      '',
      '/tmp/test-repo',
    );
  });
});
