import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/utils/hash.js';
import { buildLockFile } from '../src/core/lock.js';
import type { InitConfig, PlatformOutputFile } from '../src/types.js';
import type { WriteResult } from '../src/core/writer.js';

describe('sha256', () => {
  it('对相同内容返回相同 hash', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });

  it('对不同内容返回不同 hash', () => {
    expect(sha256('hello')).not.toBe(sha256('world'));
  });

  it('返回 64 位十六进制字符串', () => {
    const hash = sha256('test');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildLockFile', () => {
  const config: InitConfig = {
    platforms: ['claude'],
    framework: 'vue3',
    domains: [],
    projectName: 'test',
    variables: { componentPrefix: 'app' },
  };

  const files: PlatformOutputFile[] = [
    { relativePath: 'CLAUDE.md', content: '# Test', description: '主文件' },
    {
      relativePath: '.claude/agents/test.md',
      content: '---\nname: test\n---',
      description: 'Agent',
    },
  ];

  const writeResult: WriteResult = {
    writtenFiles: ['CLAUDE.md', '.claude/agents/test.md'],
    skippedFiles: [],
  };

  it('生成正确的 lock 结构', () => {
    const lock = buildLockFile(files, writeResult, config, '0.0.0');
    expect(lock.version).toBe(1);
    expect(lock.cliVersion).toBe('0.0.0');
    expect(lock.config).toEqual(config);
  });

  it('为每个写入的文件计算 hash', () => {
    const lock = buildLockFile(files, writeResult, config, '0.0.0');
    expect(lock.files['CLAUDE.md']).toBeDefined();
    expect(lock.files['CLAUDE.md']!.hash).toBe(sha256('# Test'));
    expect(lock.files['CLAUDE.md']!.status).toBe('managed');
  });

  it('跳过的文件不出现在 lock 中', () => {
    const result: WriteResult = {
      writtenFiles: ['CLAUDE.md'],
      skippedFiles: ['.claude/agents/test.md'],
    };
    const lock = buildLockFile(files, result, config, '0.0.0');
    expect(lock.files['.claude/agents/test.md']).toBeUndefined();
  });

  it('保留 ejected 状态（ejected 文件不在 writtenFiles 中）', () => {
    const existingLock = buildLockFile(files, writeResult, config, '0.0.0');
    existingLock.files['.claude/agents/test.md']!.status = 'ejected';

    // 真实场景：writeOutputFiles 会跳过 ejected 文件，放入 skippedFiles
    const upgradeWriteResult: WriteResult = {
      writtenFiles: ['CLAUDE.md'],
      skippedFiles: ['.claude/agents/test.md'],
    };

    const newLock = buildLockFile(files, upgradeWriteResult, config, '0.0.1', existingLock);
    expect(newLock.files['.claude/agents/test.md']!.status).toBe('ejected');
  });
});
