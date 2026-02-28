import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/file.js', () => ({
  readTemplate: vi.fn(),
  pathExists: vi.fn(),
  ensureDir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../src/utils/template.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/utils/template.js')>();
  return {
    ...actual,
    renderTemplate: vi.fn(),
  };
});

vi.mock('../src/utils/git.js', () => ({
  getDefaultBranch: vi.fn(),
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

import { writeWorkflows } from '../src/core/workflow-writer.js';
import { readTemplate, ensureDir, writeFile } from '../src/utils/file.js';
import { renderTemplate } from '../src/utils/template.js';
import { getDefaultBranch } from '../src/utils/git.js';
import type { InstallConfig, PhaseConfig } from '../src/types/index.js';
import type { PlatformAdapter } from '../src/platform/types.js';

const mockedReadTemplate = vi.mocked(readTemplate);
const mockedEnsureDir = vi.mocked(ensureDir);
const mockedWriteFile = vi.mocked(writeFile);
const mockedRenderTemplate = vi.mocked(renderTemplate);
const mockedGetDefaultBranch = vi.mocked(getDefaultBranch);

function createConfig(overrides?: Partial<InstallConfig>): InstallConfig {
  return {
    phases: [1],
    target: '/tmp/test-repo',
    yes: false,
    dryRun: false,
    nodeVersion: '20',
    reviewers: 'alice',
    platform: 'github',
    packageManager: 'pnpm',
    ...overrides,
  };
}

function createPhaseConfig(overrides?: Partial<PhaseConfig>): PhaseConfig {
  return {
    phase: 1,
    name: 'Issue 标签触发',
    description: 'MVP',
    workflows: ['sentinel-issue.yml'],
    labels: ['sentinel'],
    secrets: ['ANTHROPIC_API_KEY'],
    variables: ['SENTINEL_ENABLED'],
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
    getCliInstallHint: () => '',
    getExistingPipelineFiles: () => [],
    createLabel: vi.fn(),
    listSecrets: vi.fn(async () => []),
    listVariables: vi.fn(async () => []),
    getPostInstallInstructions: () => null,
    ...overrides,
  };
}

describe('writeWorkflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read template and write rendered content via adapter paths', async () => {
    const rawTemplate = 'node-version: __NODE_VERSION__';
    const rendered = 'node-version: 20';

    mockedReadTemplate.mockResolvedValue(rawTemplate);
    mockedRenderTemplate.mockReturnValue(rendered);
    mockedGetDefaultBranch.mockReturnValue('main');
    mockedEnsureDir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);

    const config = createConfig();
    const phase = createPhaseConfig();
    const adapter = createMockAdapter();

    const result = await writeWorkflows(config, phase, adapter);

    expect(mockedReadTemplate).toHaveBeenCalledWith(
      'github/sentinel-issue.yml',
    );
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.github/workflows/sentinel-issue.yml'),
      rendered,
    );
    expect(result).toEqual(
      expect.arrayContaining([expect.stringContaining('sentinel-issue.yml')]),
    );
  });

  it('should create pipeline directory if it does not exist', async () => {
    mockedReadTemplate.mockResolvedValue('template');
    mockedRenderTemplate.mockReturnValue('rendered');
    mockedGetDefaultBranch.mockReturnValue('main');
    mockedEnsureDir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);

    const adapter = createMockAdapter();
    await writeWorkflows(createConfig(), createPhaseConfig(), adapter);

    expect(mockedEnsureDir).toHaveBeenCalledWith(
      expect.stringContaining('.github/workflows'),
    );
  });

  it('should render template with correct variables', async () => {
    mockedReadTemplate.mockResolvedValue('__NODE_VERSION__ __DEFAULT_BRANCH__');
    mockedRenderTemplate.mockReturnValue('20 main');
    mockedGetDefaultBranch.mockReturnValue('main');
    mockedEnsureDir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);

    const config = createConfig({ nodeVersion: '20', reviewers: 'alice' });
    const adapter = createMockAdapter();
    await writeWorkflows(config, createPhaseConfig(), adapter);

    expect(mockedRenderTemplate).toHaveBeenCalledWith(
      '__NODE_VERSION__ __DEFAULT_BRANCH__',
      expect.objectContaining({
        NODE_VERSION: '20',
        DEFAULT_BRANCH: 'main',
      }),
    );
  });

  it('should return list of written file paths', async () => {
    mockedReadTemplate.mockResolvedValue('tpl');
    mockedRenderTemplate.mockReturnValue('out');
    mockedGetDefaultBranch.mockReturnValue('main');
    mockedEnsureDir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);

    const adapter = createMockAdapter();
    const result = await writeWorkflows(
      createConfig(),
      createPhaseConfig(),
      adapter,
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('sentinel-issue.yml');
  });

  it('should validate template but not write files in dry-run mode', async () => {
    const rawTemplate = 'node-version: __NODE_VERSION__';
    const rendered = 'node-version: 20';

    mockedReadTemplate.mockResolvedValue(rawTemplate);
    mockedRenderTemplate.mockReturnValue(rendered);
    mockedGetDefaultBranch.mockReturnValue('main');

    const config = createConfig({ dryRun: true });
    const adapter = createMockAdapter();
    const result = await writeWorkflows(config, createPhaseConfig(), adapter);

    // In dry-run, template is still read and rendered (for validation)
    expect(mockedReadTemplate).toHaveBeenCalledTimes(1);
    expect(mockedRenderTemplate).toHaveBeenCalledTimes(1);
    // But no file is actually written
    expect(mockedEnsureDir).not.toHaveBeenCalled();
    expect(mockedWriteFile).not.toHaveBeenCalled();
    expect(result.length).toBe(1);
    expect(result[0]).toContain('sentinel-issue.yml');
  });

  it('should render template with new package manager and model variables', async () => {
    mockedReadTemplate.mockResolvedValue('__PACKAGE_MANAGER__ __MODEL__');
    mockedRenderTemplate.mockReturnValue('pnpm claude-sonnet-4-6');
    mockedGetDefaultBranch.mockReturnValue('main');
    mockedEnsureDir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);

    const config = createConfig({ packageManager: 'pnpm' });
    const adapter = createMockAdapter();
    await writeWorkflows(config, createPhaseConfig(), adapter);

    expect(mockedRenderTemplate).toHaveBeenCalledWith(
      '__PACKAGE_MANAGER__ __MODEL__',
      expect.objectContaining({
        PACKAGE_MANAGER: 'pnpm',
        INSTALL_CMD: 'pnpm install --frozen-lockfile',
        RUN_CMD: 'pnpm',
        MODEL: 'claude-sonnet-4-6',
        MAX_TURNS: '30',
        PR_DAILY_LIMIT: '10',
        SMOKE_TEST_CMD: 'pnpm test:smoke',
        CRON_EXPRESSION: '0 3 * * 1',
        CHECKS_DEFAULT: 'lint,typecheck,test,audit',
      }),
    );
  });

  it('should handle multiple workflows in a phase', async () => {
    mockedReadTemplate.mockResolvedValue('tpl');
    mockedRenderTemplate.mockReturnValue('out');
    mockedGetDefaultBranch.mockReturnValue('main');
    mockedEnsureDir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);

    const phase = createPhaseConfig({
      workflows: ['sentinel-issue.yml', 'sentinel-post-deploy.yml'],
    });
    const adapter = createMockAdapter();

    const result = await writeWorkflows(createConfig(), phase, adapter);

    expect(mockedReadTemplate).toHaveBeenCalledTimes(2);
    expect(result.length).toBe(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sentinel-issue.yml'),
        expect.stringContaining('sentinel-post-deploy.yml'),
      ]),
    );
  });
});
