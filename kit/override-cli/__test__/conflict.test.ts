import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeFiles, resolveConflicts, checkProjectConflict } from '../src/conflict';
import type { GeneratedFile } from '../src/types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'override-cli-conflict-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── writeFiles ──────────────────────────────────────────────────────────────

describe('writeFiles', () => {
  it('应将文件写入到输出目录', () => {
    const files: GeneratedFile[] = [
      { path: 'types.ts', content: 'export {}' },
      { path: 'sysu/index.ts', content: 'export default {}' },
    ];

    writeFiles(files, tmpDir);

    expect(fs.existsSync(path.join(tmpDir, 'types.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'sysu/index.ts'))).toBe(true);
  });

  it('写入内容应与传入内容一致', () => {
    const content = 'export const x = 1;';
    writeFiles([{ path: 'index.ts', content }], tmpDir);

    const actual = fs.readFileSync(path.join(tmpDir, 'index.ts'), 'utf-8');
    expect(actual).toBe(content);
  });

  it('应自动创建不存在的嵌套目录', () => {
    writeFiles([{ path: 'a/b/c/deep.ts', content: '' }], tmpDir);

    expect(fs.existsSync(path.join(tmpDir, 'a/b/c/deep.ts'))).toBe(true);
  });

  it('应覆盖已存在的文件', () => {
    const filePath = path.join(tmpDir, 'index.ts');
    fs.writeFileSync(filePath, 'old content');

    writeFiles([{ path: 'index.ts', content: 'new content' }], tmpDir);

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
  });
});

// ── resolveConflicts ─────────────────────────────────────────────────────────

describe('resolveConflicts', () => {
  const files: GeneratedFile[] = [
    { path: 'types.ts', content: '' },
    { path: 'index.ts', content: '' },
    { path: 'sysu/index.ts', content: '' },
  ];

  it('无冲突时应返回全部文件', async () => {
    const result = await resolveConflicts(files, tmpDir, { force: false, yes: false });
    expect(result).toEqual(files);
  });

  it('force 模式下应返回全部文件（含冲突文件）', async () => {
    fs.writeFileSync(path.join(tmpDir, 'types.ts'), 'existing');

    const result = await resolveConflicts(files, tmpDir, { force: true, yes: false });
    expect(result).toEqual(files);
  });

  it('yes 模式下应跳过冲突文件，只返回新文件', async () => {
    fs.writeFileSync(path.join(tmpDir, 'types.ts'), 'existing');

    const result = await resolveConflicts(files, tmpDir, { force: false, yes: true });
    const paths = result!.map((f) => f.path);

    expect(paths).not.toContain('types.ts');
    expect(paths).toContain('index.ts');
    expect(paths).toContain('sysu/index.ts');
  });

  it('yes 模式下所有文件均冲突时应返回空数组', async () => {
    for (const f of files) {
      const fullPath = path.join(tmpDir, f.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, 'existing');
    }

    const result = await resolveConflicts(files, tmpDir, { force: false, yes: true });
    expect(result).toEqual([]);
  });
});

// ── checkProjectConflict ──────────────────────────────────────────────────────

describe('checkProjectConflict', () => {
  it('项目目录不存在时应返回 true', async () => {
    const result = await checkProjectConflict('newschool', tmpDir, { force: false, yes: false });
    expect(result).toBe(true);
  });

  it('项目目录为空目录时应返回 true', async () => {
    fs.mkdirSync(path.join(tmpDir, 'sysu'));

    const result = await checkProjectConflict('sysu', tmpDir, { force: false, yes: false });
    expect(result).toBe(true);
  });

  it('force 模式下目录已存在且有文件时应返回 true', async () => {
    const dir = path.join(tmpDir, 'sysu');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'index.ts'), '');

    const result = await checkProjectConflict('sysu', tmpDir, { force: true, yes: false });
    expect(result).toBe(true);
  });

  it('yes 模式下目录已存在且有文件时应返回 true', async () => {
    const dir = path.join(tmpDir, 'sysu');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'index.ts'), '');

    const result = await checkProjectConflict('sysu', tmpDir, { force: false, yes: true });
    expect(result).toBe(true);
  });
});
