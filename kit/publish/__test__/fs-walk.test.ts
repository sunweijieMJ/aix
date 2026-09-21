/**
 * 目录遍历。
 *
 * listJsFiles 是公开 API（业务仓库的 afterBuild hook 从 @kit/publish 直接拿），
 * 也是 dist-scan 推导 dependencies 的入口 —— 它漏收一种扩展名，整份产物就漏扫了。
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { listJsFiles } from '../src/utils/fs-walk';

const tmpDirs: string[] = [];

const makeTree = (files: Record<string, string>): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-publish-walk-'));
  tmpDirs.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const filePath = path.join(root, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return root;
};

const relativeNames = (root: string): string[] =>
  listJsFiles(root)
    .map((filePath) => path.relative(root, filePath).split(path.sep).join('/'))
    .sort();

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('listJsFiles', () => {
  it('收 .js / .mjs / .cjs，递归进子目录', () => {
    // vite 的 lib 模式按 formats 决定后缀，三种都可能出现在同一份产物里
    const root = makeTree({
      'index.js': '',
      'index.mjs': '',
      'index.cjs': '',
      'components/button/index.js': '',
      'js/chunk-abc.mjs': '',
    });

    expect(relativeNames(root)).toEqual([
      'components/button/index.js',
      'index.cjs',
      'index.js',
      'index.mjs',
      'js/chunk-abc.mjs',
    ]);
  });

  it('排除类型声明与非 JS 资源', () => {
    const root = makeTree({
      'index.js': '',
      'index.d.ts': '',
      'index.d.mts': '',
      'index.ts': '',
      'style.css': '',
      'index.json': '',
      'logo.svg': '',
      // 后缀写在中段不算 JS 文件
      'foo.js.map': '',
      README: '',
    });

    expect(relativeNames(root)).toEqual(['index.js']);
  });

  it('空目录返回空数组', () => {
    expect(listJsFiles(makeTree({}))).toEqual([]);
  });
});
