import { describe, expect, it, vi, beforeEach } from 'vitest';

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    default: { ...actual, execSync: execSyncMock },
    execSync: execSyncMock,
  };
});

import { parseGitRemote } from '../src/utils/git.js';

describe('parseGitRemote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse SSH remote URL', () => {
    execSyncMock.mockReturnValue('git@github.com:myorg/myrepo.git\n');
    const result = parseGitRemote('/tmp/test');
    expect(result).toEqual({ owner: 'myorg', repo: 'myrepo' });
  });

  it('should parse HTTPS remote URL', () => {
    execSyncMock.mockReturnValue('https://github.com/myorg/myrepo.git\n');
    const result = parseGitRemote('/tmp/test');
    expect(result).toEqual({ owner: 'myorg', repo: 'myrepo' });
  });

  it('should parse HTTPS remote URL without .git suffix', () => {
    execSyncMock.mockReturnValue('https://github.com/myorg/myrepo\n');
    const result = parseGitRemote('/tmp/test');
    expect(result).toEqual({ owner: 'myorg', repo: 'myrepo' });
  });

  it('should parse SSH remote URL without .git suffix', () => {
    execSyncMock.mockReturnValue('git@github.com:myorg/myrepo\n');
    const result = parseGitRemote('/tmp/test');
    expect(result).toEqual({ owner: 'myorg', repo: 'myrepo' });
  });

  it('should return null when no remote is configured', () => {
    execSyncMock.mockImplementation(() => {
      throw new Error('fatal: no such remote');
    });
    const result = parseGitRemote('/tmp/test');
    expect(result).toBeNull();
  });

  it('should return null for unrecognized URL format', () => {
    execSyncMock.mockReturnValue('file:///local/path/repo\n');
    const result = parseGitRemote('/tmp/test');
    expect(result).toBeNull();
  });
});
