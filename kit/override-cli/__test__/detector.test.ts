import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectLanguage, isProjectRoot } from '../src/detector';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'override-cli-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectLanguage', () => {
  it('存在 tsconfig.json 时返回 ts', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    expect(detectLanguage(tmpDir)).toBe('ts');
  });

  it('存在 tsconfig.app.json 时返回 ts', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.app.json'), '{}');
    expect(detectLanguage(tmpDir)).toBe('ts');
  });

  it('package.json devDependencies 包含 typescript 时返回 ts', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ devDependencies: { typescript: '^5.0.0' } }),
    );
    expect(detectLanguage(tmpDir)).toBe('ts');
  });

  it('无 TS 相关文件时返回 js', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }));
    expect(detectLanguage(tmpDir)).toBe('js');
  });

  it('空目录返回 js', () => {
    expect(detectLanguage(tmpDir)).toBe('js');
  });
});

describe('isProjectRoot', () => {
  it('存在 package.json 时返回 true', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    expect(isProjectRoot(tmpDir)).toBe(true);
  });

  it('不存在 package.json 时返回 false', () => {
    expect(isProjectRoot(tmpDir)).toBe(false);
  });
});
