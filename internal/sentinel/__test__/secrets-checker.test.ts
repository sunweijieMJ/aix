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

import { checkSecrets } from '../src/core/secrets-checker.js';
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

function createRequirement(overrides?: {
  secrets?: string[];
  variables?: string[];
}) {
  return {
    secrets: ['ANTHROPIC_API_KEY'],
    variables: ['SENTINEL_ENABLED'],
    ...overrides,
  };
}

describe('checkSecrets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return ok when all secrets and variables exist', async () => {
    const adapter = createMockAdapter({
      listSecrets: vi.fn(async () => ['ANTHROPIC_API_KEY']),
      listVariables: vi.fn(async () => ['SENTINEL_ENABLED']),
    });

    const result = await checkSecrets(
      createRequirement(),
      '/tmp/test-repo',
      adapter,
    );

    expect(result.ok).toBe(true);
    expect(result.missing.secrets).toEqual([]);
    expect(result.missing.variables).toEqual([]);
  });

  it('should return not ok when secrets are missing', async () => {
    const adapter = createMockAdapter({
      listSecrets: vi.fn(async () => []),
      listVariables: vi.fn(async () => ['SENTINEL_ENABLED']),
    });

    const result = await checkSecrets(
      createRequirement(),
      '/tmp/test-repo',
      adapter,
    );

    expect(result.ok).toBe(false);
    expect(result.missing.secrets).toContain('ANTHROPIC_API_KEY');
    expect(result.missing.variables).toEqual([]);
  });

  it('should return not ok when variables are missing', async () => {
    const adapter = createMockAdapter({
      listSecrets: vi.fn(async () => ['ANTHROPIC_API_KEY']),
      listVariables: vi.fn(async () => []),
    });

    const result = await checkSecrets(
      createRequirement(),
      '/tmp/test-repo',
      adapter,
    );

    expect(result.ok).toBe(false);
    expect(result.missing.secrets).toEqual([]);
    expect(result.missing.variables).toContain('SENTINEL_ENABLED');
  });

  it('should return all missing when both secrets and variables are absent', async () => {
    const adapter = createMockAdapter({
      listSecrets: vi.fn(async () => []),
      listVariables: vi.fn(async () => []),
    });

    const result = await checkSecrets(
      createRequirement(),
      '/tmp/test-repo',
      adapter,
    );

    expect(result.ok).toBe(false);
    expect(result.missing.secrets).toContain('ANTHROPIC_API_KEY');
    expect(result.missing.variables).toContain('SENTINEL_ENABLED');
  });

  it('should return ok when phase has empty secrets and variables', async () => {
    const adapter = createMockAdapter();

    const result = await checkSecrets(
      createRequirement({ secrets: [], variables: [] }),
      '/tmp/test-repo',
      adapter,
    );

    expect(result.ok).toBe(true);
    expect(result.missing.secrets).toEqual([]);
    expect(result.missing.variables).toEqual([]);
  });

  it('should call logger.warn when secrets are missing', async () => {
    const adapter = createMockAdapter({
      listSecrets: vi.fn(async () => []),
      listVariables: vi.fn(async () => ['SENTINEL_ENABLED']),
    });

    await checkSecrets(createRequirement(), '/tmp/test-repo', adapter);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/secrets/i));
  });

  it('should call logger.warn when variables are missing', async () => {
    const adapter = createMockAdapter({
      listSecrets: vi.fn(async () => ['ANTHROPIC_API_KEY']),
      listVariables: vi.fn(async () => []),
    });

    await checkSecrets(createRequirement(), '/tmp/test-repo', adapter);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/variables/i),
    );
  });

  it('should gracefully handle auth errors and return all as missing', async () => {
    const adapter = createMockAdapter({
      listSecrets: vi.fn(async () => {
        throw new Error('HTTP 401: requires authentication');
      }),
    });

    const requirement = createRequirement({
      secrets: ['ANTHROPIC_API_KEY', 'SENTINEL_PAT'],
      variables: ['SENTINEL_ENABLED'],
    });

    const result = await checkSecrets(requirement, '/tmp/test-repo', adapter);

    expect(result.ok).toBe(false);
    expect(result.missing.secrets).toEqual([
      'ANTHROPIC_API_KEY',
      'SENTINEL_PAT',
    ]);
    expect(result.missing.variables).toEqual(['SENTINEL_ENABLED']);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/无法读取/));
  });
});
