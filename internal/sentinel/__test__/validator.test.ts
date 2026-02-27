import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/git.js', () => ({
  isGitRepo: vi.fn(),
}));

vi.mock('../src/utils/file.js', () => ({
  pathExists: vi.fn(),
}));

import { validateEnvironment } from '../src/core/validator.js';
import { isGitRepo } from '../src/utils/git.js';
import { pathExists } from '../src/utils/file.js';
import type { InstallConfig } from '../src/types/index.js';
import type { PlatformAdapter } from '../src/platform/types.js';

const mockedIsGitRepo = vi.mocked(isGitRepo);
const mockedPathExists = vi.mocked(
  pathExists as (path: string) => Promise<boolean>,
);

function createConfig(overrides?: Partial<InstallConfig>): InstallConfig {
  return {
    phase: 1,
    target: '/tmp/test-repo',
    yes: false,
    dryRun: false,
    nodeVersion: '20',
    platform: 'github',
    ...overrides,
  };
}

function createMockAdapter(
  overrides?: Partial<PlatformAdapter>,
): PlatformAdapter {
  return {
    platform: 'github',
    getPipelineDir: (target: string) => `${target}/.github/workflows`,
    getTemplatePath: (baseName: string) => `github/${baseName}`,
    getDestFileName: (baseName: string) => baseName,
    isCliInstalled: () => true,
    getCliInstallHint: () =>
      '未检测到 GitHub CLI (gh)\n  请先安装: https://cli.github.com/',
    getExistingPipelineFiles: () => [
      'sentinel-issue.yml',
      'sentinel-post-deploy.yml',
      'sentinel-sentry.yml',
      'sentinel-scheduled.yml',
    ],
    createLabel: vi.fn(),
    listSecrets: vi.fn(async () => []),
    listVariables: vi.fn(async () => []),
    getPostInstallInstructions: () => null,
    ...overrides,
  };
}

describe('validateEnvironment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return valid when all checks pass', async () => {
    mockedIsGitRepo.mockReturnValue(true);
    mockedPathExists.mockResolvedValue(true);

    const adapter = createMockAdapter();
    const result = await validateEnvironment(createConfig(), adapter);

    expect(result).toEqual(
      expect.objectContaining({
        valid: true,
      }),
    );
  });

  it('should return error when not a git repo', async () => {
    mockedIsGitRepo.mockReturnValue(false);
    mockedPathExists.mockResolvedValue(true);

    const adapter = createMockAdapter();
    const result = await validateEnvironment(createConfig(), adapter);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/git/i)]),
    );
  });

  it('should return error when platform CLI is not installed', async () => {
    mockedIsGitRepo.mockReturnValue(true);
    mockedPathExists.mockResolvedValue(true);

    const adapter = createMockAdapter({ isCliInstalled: () => false });
    const result = await validateEnvironment(createConfig(), adapter);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/gh/i)]),
    );
  });

  it('should return valid even when platform config dir does not exist', async () => {
    mockedIsGitRepo.mockReturnValue(true);
    mockedPathExists.mockResolvedValue(false);

    const adapter = createMockAdapter();
    const result = await validateEnvironment(createConfig(), adapter);

    expect(result.valid).toBe(true);
  });

  it('should return two errors when both git repo and CLI checks fail', async () => {
    mockedIsGitRepo.mockReturnValue(false);
    mockedPathExists.mockResolvedValue(true);

    const adapter = createMockAdapter({ isCliInstalled: () => false });
    const result = await validateEnvironment(createConfig(), adapter);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('should use adapter methods for platform-specific checks', async () => {
    mockedIsGitRepo.mockReturnValue(true);
    mockedPathExists.mockResolvedValue(true);

    const adapter = createMockAdapter({
      isCliInstalled: () => false,
      getCliInstallHint: () => '未检测到 GitHub CLI (gh)',
    });

    const result = await validateEnvironment(createConfig(), adapter);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/gh/i)]),
    );
  });
});
