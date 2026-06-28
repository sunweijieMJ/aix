import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FileUtils } from '../src/utils/file-utils';

/**
 * 回归（三轮审计 #6，medium，generate 改写本应排除的源码）：getFrameworkFiles 的
 * exclude 仅按单段文件名（entry.name）匹配，含路径分隔符的 glob（如 `src/legacy/**`）
 * 永远命中不了 → 静默失效，而 include 侧用完整相对路径匹配，二者不对称。用户配
 * `io.exclude: ['src/legacy/**']` 既无告警又不生效，generate 仍会扫描并改写这些文件。
 *
 * 修复：含 '/' 的 exclude 模式按相对 POSIX 路径匹配（与 include 一致）。
 */
describe('getFrameworkFiles：含路径分隔符的 exclude glob 生效（审计三轮 #6）', () => {
  let root: string;
  let srcDir: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-exclude-pathglob-'));
    srcDir = path.join(root, 'src');
    fs.mkdirSync(path.join(srcDir, 'legacy'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'legacy', 'old.tsx'), 'export const a = 1;');
    fs.writeFileSync(path.join(srcDir, 'pages', 'home.tsx'), 'export const b = 2;');
    fs.writeFileSync(path.join(srcDir, 'app.tsx'), 'export const c = 3;');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const names = (files: string[]): string[] => files.map((f) => path.basename(f)).sort();

  it('src/legacy/** 排除 legacy 下文件，保留其余', () => {
    const files = FileUtils.getFrameworkFiles(srcDir, ['.tsx'], ['src/legacy/**'], [], root);
    expect(names(files)).toEqual(['app.tsx', 'home.tsx']);
  });

  it('不配该 exclude 时 legacy 文件仍被扫描（确认上面是 exclude 起的作用）', () => {
    const files = FileUtils.getFrameworkFiles(srcDir, ['.tsx'], [], [], root);
    expect(names(files)).toEqual(['app.tsx', 'home.tsx', 'old.tsx']);
  });

  it('单段 basename exclude 既有行为不变（node_modules 等）', () => {
    const files = FileUtils.getFrameworkFiles(srcDir, ['.tsx'], ['legacy'], [], root);
    // 'legacy' 作为单段目录名匹配，仍按既有 basename 语义剪枝整个 legacy 目录
    expect(names(files)).toEqual(['app.tsx', 'home.tsx']);
  });
});
