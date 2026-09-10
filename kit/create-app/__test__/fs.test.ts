/**
 * utils/fs 的两处「静默产坏结果」点
 *
 * - printFileTree：生成后给用户看的唯一产物清单，缩进/连接符错了看不出来，但树就读不成树
 * - emptyDir：覆盖已有目录时先清空，漏掉 `.git` 白名单等于抹掉用户的仓库历史
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileList } from '../src/types';
import { emptyDir, printFileTree, writeFiles } from '../src/utils/fs';

let logs: string[];

function entries(...paths: string[]): FileList {
  return paths.map((p) => ({ path: p, content: '' }));
}

beforeEach(() => {
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('printFileTree', () => {
  it('嵌套路径渲染成树：目录带 /，末项用 └──，非末项的子级续 │', () => {
    printFileTree(
      entries(
        'sysu/router/index.ts',
        'sysu/router/routes.ts',
        'sysu/views/.gitkeep',
        'sysu/index.ts',
      ),
      'src/overrides',
    );

    expect(logs.join('\n')).toBe(
      [
        '  src/overrides/',
        '  └── sysu/',
        '      ├── index.ts',
        '      ├── router/',
        '      │   ├── index.ts',
        '      │   └── routes.ts',
        '      └── views/',
        '          └── .gitkeep',
      ].join('\n'),
    );
  });

  it('同一层的多个根节点各自成枝（非末项用 ├──，子级前缀带 │）', () => {
    printFileTree(entries('a/x.ts', 'b/y.ts'), 'root');

    expect(logs.join('\n')).toBe(
      ['  root/', '  ├── a/', '  │   └── x.ts', '  └── b/', '      └── y.ts'].join('\n'),
    );
  });

  it('同名目录只出现一次（多个文件共享前缀时合并成一个节点）', () => {
    printFileTree(entries('api/a.ts', 'api/b.ts', 'api/c.ts'), 'root');
    expect(logs.filter((line) => line.includes('api/'))).toHaveLength(1);
  });

  it('输入顺序不影响输出顺序（按名字排序，产物清单可比对）', () => {
    printFileTree(entries('z.ts', 'a.ts', 'm/x.ts'), 'root');
    const shuffled = [...logs];
    logs = [];
    printFileTree(entries('m/x.ts', 'z.ts', 'a.ts'), 'root');
    expect(logs).toEqual(shuffled);
    expect(logs).toEqual(['  root/', '  ├── a.ts', '  ├── m/', '  │   └── x.ts', '  └── z.ts']);
  });

  it('空列表只打印根标签', () => {
    printFileTree([], 'root');
    expect(logs).toEqual(['  root/']);
  });
});

describe('emptyDir', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-empty-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('清掉所有内容但保留目录本身与 .git/（用户可能在已有仓库里重新生成）', () => {
    fs.mkdirSync(path.join(dir, '.git/objects'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git/HEAD'), 'ref: refs/heads/main\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/old.ts'), 'x');
    fs.writeFileSync(path.join(dir, '.env'), 'x');

    emptyDir(dir);

    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(['.git']);
    expect(fs.readFileSync(path.join(dir, '.git/HEAD'), 'utf-8')).toContain('refs/heads/main');
  });

  it('目录不存在时静默返回', () => {
    expect(() => emptyDir(path.join(dir, 'nope'))).not.toThrow();
  });
});

/**
 * writeFiles 的符号链接分支
 *
 * 产物里保住链接是「一份内容两个名字」这个约定能不能活下来的关键；
 * 但建链接在 Windows 上可能没权限，所以失败必须回落成副本而不是打断整个生成。
 */
describe('writeFiles - 符号链接', () => {
  let dest: string;

  beforeEach(() => {
    dest = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-writefiles-'));
  });

  afterEach(() => {
    fs.rmSync(dest, { recursive: true, force: true });
  });

  it('带 symlinkTarget 的条目落盘为符号链接，且读得到目标内容', () => {
    writeFiles(
      [
        { path: 'CLAUDE.md', content: '# 指南\n' },
        { path: 'AGENTS.md', content: '# 指南\n', symlinkTarget: 'CLAUDE.md' },
      ],
      dest,
    );

    const link = path.join(dest, 'AGENTS.md');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe('CLAUDE.md');
    expect(fs.readFileSync(link, 'utf-8')).toBe('# 指南\n');
  });

  it('链接先于目标写入也不出问题（顺序无关）', () => {
    writeFiles(
      [
        { path: 'AGENTS.md', content: '# 指南\n', symlinkTarget: 'CLAUDE.md' },
        { path: 'CLAUDE.md', content: '# 指南\n' },
      ],
      dest,
    );

    expect(fs.readFileSync(path.join(dest, 'AGENTS.md'), 'utf-8')).toBe('# 指南\n');
  });

  it('目标路径已存在旧文件时先删再建链接（覆盖生成场景）', () => {
    fs.writeFileSync(path.join(dest, 'AGENTS.md'), '上一次生成留下的副本\n');

    writeFiles(
      [
        { path: 'CLAUDE.md', content: '# 新内容\n' },
        { path: 'AGENTS.md', content: '# 新内容\n', symlinkTarget: 'CLAUDE.md' },
      ],
      dest,
    );

    expect(fs.lstatSync(path.join(dest, 'AGENTS.md')).isSymbolicLink()).toBe(true);
  });

  it('建链接失败时回落成静态副本，不抛错', () => {
    const spy = vi.spyOn(fs, 'symlinkSync').mockImplementation(() => {
      throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); // 模拟 Windows 无权限
    });

    expect(() =>
      writeFiles([{ path: 'AGENTS.md', content: '# 指南\n', symlinkTarget: 'CLAUDE.md' }], dest),
    ).not.toThrow();

    const out = path.join(dest, 'AGENTS.md');
    expect(fs.lstatSync(out).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(out, 'utf-8')).toBe('# 指南\n');
    spy.mockRestore();
  });

  it('没有 symlinkTarget 的条目照旧写普通文件', () => {
    writeFiles([{ path: 'plain.md', content: 'x\n', mode: 0o644 }], dest);

    expect(fs.lstatSync(path.join(dest, 'plain.md')).isSymbolicLink()).toBe(false);
  });
});
