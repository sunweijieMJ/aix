import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/core/validator.js', () => ({
  validateEnvironment: vi.fn(),
}));

vi.mock('../src/core/workflow-writer.js', () => ({
  writeWorkflows: vi.fn(),
}));

vi.mock('../src/core/claude-md-patcher.js', () => ({
  patchClaudeMd: vi.fn(),
}));

vi.mock('../src/core/label-creator.js', () => ({
  createLabels: vi.fn(),
}));

vi.mock('../src/core/secrets-checker.js', () => ({
  checkSecrets: vi.fn(),
}));

vi.mock('../src/platform/index.js', () => ({
  createPlatformAdapter: vi.fn(() => ({
    platform: 'github',
    getPipelineDir: vi.fn(),
    getTemplatePath: vi.fn(),
    getDestFileName: vi.fn(),
    isCliInstalled: vi.fn(() => true),
    getCliInstallHint: vi.fn(),
    getExistingPipelineFiles: vi.fn(() => []),
    createLabel: vi.fn(),
    listSecrets: vi.fn(async () => []),
    listVariables: vi.fn(async () => []),
    getPostInstallInstructions: vi.fn(() => null),
  })),
}));

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

import { install } from '../src/core/installer.js';
import { validateEnvironment } from '../src/core/validator.js';
import { writeWorkflows } from '../src/core/workflow-writer.js';
import { patchClaudeMd } from '../src/core/claude-md-patcher.js';
import { createLabels } from '../src/core/label-creator.js';
import { checkSecrets } from '../src/core/secrets-checker.js';
import type { InstallConfig } from '../src/types/index.js';

const mockedValidateEnvironment = vi.mocked(validateEnvironment);
const mockedWriteWorkflows = vi.mocked(writeWorkflows);
const mockedPatchClaudeMd = vi.mocked(patchClaudeMd);
const mockedCreateLabels = vi.mocked(createLabels);
const mockedCheckSecrets = vi.mocked(checkSecrets);

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

function setupSuccessMocks() {
  mockedValidateEnvironment.mockResolvedValue({
    valid: true,
    errors: [],
  });
  mockedWriteWorkflows.mockResolvedValue(['sentinel-issue.yml']);
  mockedPatchClaudeMd.mockResolvedValue(true);
  mockedCreateLabels.mockResolvedValue([
    'sentinel',
    'bot',
    'sentry',
    'post-deploy',
    'urgent',
    'maintenance',
  ]);
  mockedCheckSecrets.mockResolvedValue({
    ok: true,
    missing: { secrets: [], variables: [] },
  });
}

describe('install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should install only issue workflow for phase 1', async () => {
    setupSuccessMocks();

    const result = await install(createConfig({ phase: 1 }));

    expect(mockedWriteWorkflows).toHaveBeenCalledTimes(1);
    expect(mockedWriteWorkflows).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 1 }),
      expect.objectContaining({ workflows: ['sentinel-issue.yml'] }),
      expect.any(Object),
    );
    expect(result.workflows).toEqual(
      expect.arrayContaining([expect.stringContaining('sentinel-issue')]),
    );
  });

  it('should install phases 1, 2, 3 cumulatively for phase 3', async () => {
    setupSuccessMocks();
    mockedWriteWorkflows.mockResolvedValueOnce(['sentinel-issue.yml']);
    mockedWriteWorkflows.mockResolvedValueOnce(['sentinel-post-deploy.yml']);
    mockedWriteWorkflows.mockResolvedValueOnce(['sentinel-sentry.yml']);

    const result = await install(createConfig({ phase: 3 }));

    expect(mockedWriteWorkflows).toHaveBeenCalledTimes(3);
    expect(result.workflows).toEqual(
      expect.arrayContaining([
        'sentinel-issue.yml',
        'sentinel-post-deploy.yml',
        'sentinel-sentry.yml',
      ]),
    );
  });

  it('should call patchClaudeMd exactly once', async () => {
    setupSuccessMocks();

    await install(createConfig({ phase: 3 }));

    expect(mockedPatchClaudeMd).toHaveBeenCalledTimes(1);
  });

  it('should call createLabels once with deduplicated labels for multi-phase install', async () => {
    setupSuccessMocks();
    mockedWriteWorkflows.mockResolvedValueOnce(['sentinel-issue.yml']);
    mockedWriteWorkflows.mockResolvedValueOnce(['sentinel-post-deploy.yml']);
    mockedWriteWorkflows.mockResolvedValueOnce(['sentinel-sentry.yml']);

    await install(createConfig({ phase: 3 }));

    // createLabels should be called exactly once with deduplicated labels
    expect(mockedCreateLabels).toHaveBeenCalledTimes(1);
    const [labels] = mockedCreateLabels.mock.calls[0]!;
    // Phase 1: sentinel, bot / Phase 2: sentinel, post-deploy, urgent / Phase 3: sentinel, bot, sentry
    // Deduplicated: sentinel, bot, post-deploy, urgent, sentry
    expect(labels).toEqual(
      expect.arrayContaining([
        'sentinel',
        'bot',
        'post-deploy',
        'urgent',
        'sentry',
      ]),
    );
    expect(new Set(labels).size).toBe((labels as string[]).length); // no duplicates
  });

  it('should call checkSecrets with aggregated secrets requirement', async () => {
    setupSuccessMocks();

    await install(createConfig({ phase: 3 }));

    // checkSecrets receives { secrets, variables } (not full PhaseConfig)
    expect(mockedCheckSecrets).toHaveBeenCalledWith(
      expect.objectContaining({
        secrets: expect.arrayContaining(['ANTHROPIC_API_KEY', 'SENTINEL_PAT']),
        variables: expect.arrayContaining(['SENTINEL_ENABLED']),
      }),
      '/tmp/test-repo',
      expect.any(Object),
    );
  });

  it('should return correct InstallResult with all fields', async () => {
    setupSuccessMocks();

    const result = await install(createConfig({ phase: 1 }));

    expect(result).toEqual(
      expect.objectContaining({
        workflows: expect.any(Array),
        labels: expect.any(Array),
        claudeMdPatched: true,
        secretsOk: true,
      }),
    );
  });

  it('should throw or fail gracefully when validation fails', async () => {
    mockedValidateEnvironment.mockResolvedValue({
      valid: false,
      errors: ['Not a git repository'],
    });

    await expect(install(createConfig())).rejects.toThrow();
  });

  it('should pass dryRun flag to all sub-modules in dry-run mode', async () => {
    setupSuccessMocks();

    const config = createConfig({ dryRun: true });
    await install(config);

    expect(mockedWriteWorkflows).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
      expect.any(Object),
      expect.any(Object),
    );

    expect(mockedCreateLabels).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      true,
      expect.any(Object),
    );

    expect(mockedPatchClaudeMd).toHaveBeenCalledWith(expect.any(String), true);
  });
});
