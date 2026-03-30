import { describe, expect, it, vi, beforeEach } from 'vitest';
import { detectPlatforms } from '../src/core/detector.js';

// Mock existsSync
vi.mock('../src/utils/fs.js', () => ({
  existsSync: vi.fn((p: string) => {
    // 模拟一个只有 CLAUDE.md 和 .cursor/ 的项目
    const mockPaths = ['/project/CLAUDE.md', '/project/.cursor'];
    return mockPaths.some((mp) => p.endsWith(mp.replace('/project', '')));
  }),
}));

describe('detectPlatforms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('检测到 Claude 和 Cursor', () => {
    const platforms = detectPlatforms('/project');
    expect(platforms).toContain('claude');
    expect(platforms).toContain('cursor');
  });

  it('未检测到其他平台', () => {
    const platforms = detectPlatforms('/project');
    expect(platforms).not.toContain('copilot');
    expect(platforms).not.toContain('codex');
    expect(platforms).not.toContain('windsurf');
    expect(platforms).not.toContain('tongyi');
  });
});
