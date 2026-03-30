import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createBackup,
  restoreFromBackup,
  hasBackup,
} from '../src/core/backup.js';

describe('backup', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-preset-test-'));

    // 创建测试文件
    await fs.mkdir(path.join(tempDir, '.claude', 'agents'), {
      recursive: true,
    });
    await fs.writeFile(path.join(tempDir, 'CLAUDE.md'), '# Original Content');
    await fs.writeFile(
      path.join(tempDir, '.claude', 'agents', 'test.md'),
      '---\nname: test\n---\nOriginal agent',
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('hasBackup 无备份时返回 false', () => {
    expect(hasBackup(tempDir)).toBe(false);
  });

  it('createBackup 创建备份', async () => {
    const count = await createBackup(tempDir, [
      'CLAUDE.md',
      '.claude/agents/test.md',
    ]);
    expect(count).toBe(2);
    expect(hasBackup(tempDir)).toBe(true);
  });

  it('createBackup 跳过不存在的文件', async () => {
    const count = await createBackup(tempDir, ['CLAUDE.md', 'nonexistent.md']);
    expect(count).toBe(1);
  });

  it('restoreFromBackup 恢复文件', async () => {
    // 备份
    await createBackup(tempDir, ['CLAUDE.md']);

    // 修改文件
    await fs.writeFile(path.join(tempDir, 'CLAUDE.md'), '# Modified');

    // 恢复
    const restored = await restoreFromBackup(tempDir);
    expect(restored).toBe(1);

    // 验证内容恢复
    const content = await fs.readFile(path.join(tempDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toBe('# Original Content');
  });

  it('restoreFromBackup 无备份时抛错', async () => {
    await expect(restoreFromBackup(tempDir)).rejects.toThrow('没有可用的备份');
  });
});
