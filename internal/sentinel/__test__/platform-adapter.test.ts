import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execSyncMock, execFileMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  execFileMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    default: { ...actual, execSync: execSyncMock, execFile: execFileMock },
    execSync: execSyncMock,
    execFile: execFileMock,
  };
});

import { createPlatformAdapter, GitHubAdapter } from '../src/platform/index.js';

describe('createPlatformAdapter', () => {
  it('should return GitHubAdapter for github platform', () => {
    const adapter = createPlatformAdapter('github');
    expect(adapter).toBeInstanceOf(GitHubAdapter);
    expect(adapter.platform).toBe('github');
  });
});

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GitHubAdapter();
  });

  it('should return correct pipeline directory', () => {
    expect(adapter.getPipelineDir('/repo')).toBe('/repo/.github/workflows');
  });

  it('should return correct template path', () => {
    expect(adapter.getTemplatePath('sentinel-issue.yml')).toBe(
      'github/sentinel-issue.yml',
    );
  });

  it('should return same dest file name', () => {
    expect(adapter.getDestFileName('sentinel-issue.yml')).toBe(
      'sentinel-issue.yml',
    );
  });

  it('should return 4 existing pipeline files', () => {
    const files = adapter.getExistingPipelineFiles();
    expect(files).toHaveLength(4);
    expect(files).toContain('sentinel-issue.yml');
    expect(files).toContain('sentinel-post-deploy.yml');
    expect(files).toContain('sentinel-sentry.yml');
    expect(files).toContain('sentinel-scheduled.yml');
  });

  it('should return null for post install instructions when no sentry workflow', () => {
    expect(adapter.getPostInstallInstructions([])).toBeNull();
    expect(
      adapter.getPostInstallInstructions(['sentinel-issue.yml']),
    ).toBeNull();
  });

  it('should return sentry instructions when sentry workflow is present', () => {
    const instructions = adapter.getPostInstallInstructions([
      'sentinel-sentry.yml',
    ]);
    expect(instructions).not.toBeNull();
    expect(instructions).toContain('Sentry');
    expect(instructions).toContain('Cloudflare Worker');
  });

  describe('isCliInstalled', () => {
    it('should return true when gh CLI is available', () => {
      execSyncMock.mockReturnValue('gh version 2.40.0');
      expect(adapter.isCliInstalled()).toBe(true);
    });

    it('should return false when gh CLI is not available', () => {
      execSyncMock.mockImplementation(() => {
        throw new Error('command not found: gh');
      });
      expect(adapter.isCliInstalled()).toBe(false);
    });
  });

  describe('createLabel', () => {
    it('should call gh label create with --force flag', async () => {
      execFileMock.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, '', '');
        },
      );

      await adapter.createLabel(
        'sentinel',
        '0E8A16',
        'AI auto-fix label',
        '/repo',
      );

      expect(execFileMock).toHaveBeenCalledWith(
        'gh',
        [
          'label',
          'create',
          'sentinel',
          '--color',
          '0E8A16',
          '--description',
          'AI auto-fix label',
          '--force',
        ],
        expect.objectContaining({ cwd: '/repo' }),
        expect.any(Function),
      );
    });
  });

  describe('listSecrets', () => {
    it('should parse tab-separated output', async () => {
      execFileMock.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (
            err: Error | null,
            result: { stdout: string; stderr: string },
          ) => void,
        ) => {
          cb(null, {
            stdout: 'ANTHROPIC_API_KEY\t2024-01-01\nGITHUB_TOKEN\t2024-01-01\n',
            stderr: '',
          });
        },
      );

      const result = await adapter.listSecrets('/repo');
      expect(result).toEqual(['ANTHROPIC_API_KEY', 'GITHUB_TOKEN']);
    });

    it('should return empty array when no secrets exist', async () => {
      execFileMock.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (
            err: Error | null,
            result: { stdout: string; stderr: string },
          ) => void,
        ) => {
          cb(null, { stdout: '', stderr: '' });
        },
      );
      const result = await adapter.listSecrets('/repo');
      expect(result).toEqual([]);
    });

    it('should throw on auth/permission errors', async () => {
      execFileMock.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null) => void,
        ) => {
          cb(new Error('HTTP 401: requires authentication'));
        },
      );

      await expect(adapter.listSecrets('/repo')).rejects.toThrow(
        /认证或权限不足/,
      );
    });

    it('should return empty array on non-auth errors', async () => {
      execFileMock.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null) => void,
        ) => {
          cb(new Error('no secrets found'));
        },
      );

      const result = await adapter.listSecrets('/repo');
      expect(result).toEqual([]);
    });
  });

  describe('listVariables', () => {
    it('should parse tab-separated output', async () => {
      execFileMock.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (
            err: Error | null,
            result: { stdout: string; stderr: string },
          ) => void,
        ) => {
          cb(null, {
            stdout: 'SENTINEL_ENABLED\ttrue\t2024-01-01\n',
            stderr: '',
          });
        },
      );

      const result = await adapter.listVariables('/repo');
      expect(result).toEqual(['SENTINEL_ENABLED']);
    });

    it('should throw on auth errors', async () => {
      execFileMock.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null) => void,
        ) => {
          cb(new Error('HTTP 403: forbidden'));
        },
      );

      await expect(adapter.listVariables('/repo')).rejects.toThrow(
        /认证或权限不足/,
      );
    });
  });
});
