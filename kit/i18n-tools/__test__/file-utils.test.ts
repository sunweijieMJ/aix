import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FileUtils } from '../src/utils/file-utils';

// 回归测试：扫描子目录时，include 模式应以 rootDir 为基准做相对路径匹配，
// 而不是把传入的子目录当 base，否则像 src/**/*.vue 这种模式会因为相对路径
// 缺少 src/ 前缀而漏掉所有文件。
describe('FileUtils.getFrameworkFiles - include 匹配基准', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-fileutils-'));
    const components = path.join(tmpRoot, 'src', 'pages', 'flipped-course', 'components');
    fs.mkdirSync(components, { recursive: true });
    fs.writeFileSync(path.join(components, 'BlurOverlay.vue'), '<template></template>');
    fs.writeFileSync(path.join(components, 'Map2D.vue'), '<template></template>');

    const skeleton = path.join(components, 'skeleton');
    fs.mkdirSync(skeleton, { recursive: true });
    fs.writeFileSync(path.join(skeleton, 'Loader.vue'), '<template></template>');

    // 项目根之外的“干扰文件”，确保 include 模式真的起作用
    const apiDir = path.join(tmpRoot, 'src', 'api');
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, 'user.ts'), 'export {}');
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('扫描子目录时传入 rootDir，能命中以项目根为基准的 include 模式', () => {
    const subDir = path.join(tmpRoot, 'src', 'pages', 'flipped-course', 'components');
    const files = FileUtils.getFrameworkFiles(
      subDir,
      ['.vue', '.ts', '.js'],
      ['node_modules', 'dist'],
      ['src/**/*.vue'],
      tmpRoot,
    );

    expect(files.length).toBe(3);
    expect(files.some((f) => f.endsWith('BlurOverlay.vue'))).toBe(true);
    expect(files.some((f) => f.endsWith('Map2D.vue'))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join('skeleton', 'Loader.vue')))).toBe(true);
  });

  it('未传 rootDir 时回退到 dirPath，相对模式以子目录为基准（保留旧行为）', () => {
    const subDir = path.join(tmpRoot, 'src', 'pages', 'flipped-course', 'components');
    const files = FileUtils.getFrameworkFiles(
      subDir,
      ['.vue', '.ts', '.js'],
      ['node_modules', 'dist'],
      ['**/*.vue'],
    );

    expect(files.length).toBe(3);
  });

  it('未传 rootDir 时，旧 bug 重现：子目录基准下 src/**/*.vue 命中为 0', () => {
    const subDir = path.join(tmpRoot, 'src', 'pages', 'flipped-course', 'components');
    const files = FileUtils.getFrameworkFiles(
      subDir,
      ['.vue', '.ts', '.js'],
      ['node_modules', 'dist'],
      ['src/**/*.vue'],
    );

    expect(files.length).toBe(0);
  });
});
