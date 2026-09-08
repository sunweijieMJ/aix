/**
 * 发布清单（dist/package.json）的生成。
 *
 * 在临时目录里造真实的 dist 与根 package.json 来跑：这一层的判据全是「文件在不在」
 * 与「产物里引用了什么」，mock 掉文件系统等于把要验的东西一起 mock 掉了。
 * dist-scan 顶层 await 了 es-module-lexer 的 WASM，import 即等待，不需要额外处理。
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeManifest } from '../src/core/manifest';
import type { PublishContext, ResolvedConfig } from '../src/config/types';

// ============ 临时仓库 ============

const tmpDirs: string[] = [];

const makeRepo = (rootPackage: Record<string, unknown> = {}): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-publish-manifest-'));
  tmpDirs.push(root);
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: '@demo/pkg', version: '1.0.0', ...rootPackage }, null, 2),
  );
  fs.mkdirSync(path.join(root, 'dist'));
  return root;
};

/** 在 dist 下写一个文件，父目录自动建 */
const writeDist = (root: string, relative: string, content = ''): void => {
  const filePath = path.join(root, 'dist', relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const makeCtx = (
  root: string,
  manifest: Partial<ResolvedConfig['manifest']> = {},
): PublishContext => {
  const config: ResolvedConfig = {
    configPath: path.join(root, 'publish.config.ts'),
    projectRoot: root,
    configFile: 'publish.config.ts',
    registry: 'http://registry.test/',
    distDir: 'dist',
    build: { command: ['vite', 'build'] },
    tags: { default: 'latest', defaultDeclared: false, byBranch: {}, mainline: ['beta'] },
    manifest: { peerDependencies: [], extra: {}, copy: [], ...manifest },
    hooks: {},
  };

  return {
    projectRoot: root,
    distPath: path.join(root, 'dist'),
    name: '@demo/pkg',
    registry: config.registry,
    config,
  };
};

const readManifest = (root: string): Record<string, any> =>
  JSON.parse(fs.readFileSync(path.join(root, 'dist', 'package.json'), 'utf-8'));

// ============ 日志捕获 ============

// 颜色开关在 logger 模块加载时就定好了，测试里不便改，所以断言前把 ANSI 剥掉
const ESC = String.fromCharCode(27);
const stripAnsi = (text: string): string => text.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');

let lines: string[] = [];

/** 本条用例里 logInfo / logOk / logWarn 打出的全部内容 */
const logged = (): string => lines.join('\n');

beforeEach(() => {
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(stripAnsi(args.map(String).join(' ')));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

// ============ exports 派生 ============

describe('exports 按目录派生', () => {
  it('一级目录含 index.js 的即为入口，dist 根的 index.js 成为 "."', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');
    writeDist(root, 'components/index.js', 'export const b = 1;\n');
    writeDist(root, 'utils/index.js', 'export const c = 1;\n');
    writeDist(root, 'style.css', '.a{}');
    // 没有 index.js 的目录不是入口
    writeDist(root, 'assets/logo.svg', '<svg/>');

    const manifest = writeManifest({ ctx: makeCtx(root), version: '1.2.3' });

    expect(manifest.exports).toEqual({
      '.': './index.js',
      './components': './components/index.js',
      './utils': './utils/index.js',
      './style.css': './style.css',
      './*': './*',
    });
    expect(manifest.name).toBe('@demo/pkg');
    expect(manifest.version).toBe('1.2.3');
    expect(readManifest(root).version).toBe('1.2.3');
  });

  it('没有 "." 可指时不硬造一个', () => {
    const root = makeRepo();
    writeDist(root, 'components/index.js', 'export const b = 1;\n');

    const manifest = writeManifest({ ctx: makeCtx(root), version: '1.0.0' });
    // 用 Object.keys 而不是 toHaveProperty：'.' 与 './x' 会被当成属性路径切开
    expect(Object.keys(manifest.exports)).toEqual(['./components', './*']);
  });

  it('rootEntry 指定时它成为 "."，不再重复出现为子路径', () => {
    const root = makeRepo();
    writeDist(root, 'build/index.js', 'export const b = 1;\n');
    writeDist(root, 'utils/index.js', 'export const c = 1;\n');

    const manifest = writeManifest({
      ctx: makeCtx(root, { rootEntry: 'build' }),
      version: '1.0.0',
    });

    expect(manifest.exports['.']).toBe('./build/index.js');
    expect(Object.keys(manifest.exports)).toEqual(['.', './utils', './*']);
  });

  it('rootEntry 指定的目录不存在时报错', () => {
    const root = makeRepo();
    writeDist(root, 'utils/index.js', 'export const c = 1;\n');

    expect(() =>
      writeManifest({ ctx: makeCtx(root, { rootEntry: 'build' }), version: '1.0.0' }),
    ).toThrow(/dist\/build\/index\.js 不存在/);
  });

  it('extra 在核心字段之后合并', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');

    const manifest = writeManifest({
      ctx: makeCtx(root, { extra: { main: 'index.js', sideEffects: false } }),
      version: '1.0.0',
    });

    expect(manifest.main).toBe('index.js');
    expect(manifest.sideEffects).toBe(false);
  });
});

// ============ exports 目标存在性 ============

describe('exports 目标必须存在', () => {
  it('派生出来的目标本就来自扫描，零误报', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');
    writeDist(root, 'components/index.js', 'export const b = 1;\n');
    writeDist(root, 'style.css', '.a{}');

    expect(() => writeManifest({ ctx: makeCtx(root), version: '1.0.0' })).not.toThrow();
  });

  it('函数覆盖时缺失的目标一次性全部列出', () => {
    const root = makeRepo();
    writeDist(root, 'Foo.es.js', 'export const a = 1;\n');

    const ctx = makeCtx(root, {
      exports: () => ({
        '.': { types: './index.d.ts', import: './Foo.es.js', require: './Foo.umd.js' },
        './style.css': './Foo.css',
      }),
    });

    let message = '';
    try {
      writeManifest({ ctx, version: '1.0.0' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    // 命中第一个就停会让人修一个再撞一个，所以三项都得在
    expect(message).toMatch(/index\.d\.ts/);
    expect(message).toMatch(/Foo\.umd\.js/);
    expect(message).toMatch(/Foo\.css/);
    // 存在的那个不该被列进来
    expect(message).not.toMatch(/Foo\.es\.js/);
    // 报错发生在落盘之前
    expect(fs.existsSync(path.join(root, 'dist', 'package.json'))).toBe(false);
  });

  it('条件对象里的每一层字符串目标都查', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');

    const ctx = makeCtx(root, {
      exports: () => ({ '.': { import: { types: './deep.d.ts', default: './index.js' } } }),
    });

    expect(() => writeManifest({ ctx, version: '1.0.0' })).toThrow(/deep\.d\.ts/);
  });

  it('带 * 的目标跳过，裸包名（转发到另一个包）也跳过', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');

    const ctx = makeCtx(root, {
      exports: () => ({
        '.': './index.js',
        './assets/*': './assets/*',
        './vue': 'vue',
      }),
    });

    expect(() => writeManifest({ ctx, version: '1.0.0' })).not.toThrow();
  });

  it('./package.json 放行：它由本函数随后写出', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');

    const ctx = makeCtx(root, {
      exports: () => ({ '.': './index.js', './package.json': './package.json' }),
    });

    expect(() => writeManifest({ ctx, version: '1.0.0' })).not.toThrow();
    expect(readManifest(root).exports['./package.json']).toBe('./package.json');
  });
});

// ============ 日志 ============

describe('入口日志按最终写出的 exports 打', () => {
  it('派生时列出各子路径，通配另计', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');
    writeDist(root, 'components/index.js', 'export const b = 1;\n');
    writeDist(root, 'utils/index.js', 'export const c = 1;\n');

    writeManifest({ ctx: makeCtx(root), version: '1.0.0' });

    expect(logged()).toMatch(/exports 入口 3 个: \., \.\/components, \.\/utils，另有 1 条通配/);
  });

  it('函数覆盖时按覆盖后的键打，并点明是被覆盖的', () => {
    const root = makeRepo();
    // 目录派生会得到 components / utils，而覆盖后的清单里一个都没有 —— 按 entries 打就是报了份假名单
    writeDist(root, 'components/index.js', 'export const b = 1;\n');
    writeDist(root, 'utils/index.js', 'export const c = 1;\n');
    writeDist(root, 'Foo.es.js', 'export const a = 1;\n');
    writeDist(root, 'Foo.css', '.a{}');

    const ctx = makeCtx(root, {
      exports: () => ({ '.': './Foo.es.js', './style.css': './Foo.css' }),
    });
    writeManifest({ ctx, version: '1.0.0' });

    const output = logged();
    expect(output).toMatch(/exports 入口 2 个（由 manifest\.exports 覆盖）: \., \.\/style\.css/);
    expect(output).not.toMatch(/components/);
  });
});

// ============ dependencies / peerDependencies ============

describe('dependencies 由产物反推', () => {
  it('只写产物里仍以裸导入引用、且根 package.json 声明了版本的包', () => {
    const root = makeRepo({
      dependencies: { axios: '^1.6.0', lodash: '^4.17.0', less: '^4.2.0' },
    });
    writeDist(
      root,
      'index.js',
      "import axios from 'axios';\nimport fs from 'node:fs';\nexport { axios, fs };\n",
    );
    writeDist(root, 'utils/index.js', "export * from 'lodash/merge';\n");

    const manifest = writeManifest({ ctx: makeCtx(root), version: '1.0.0' });

    // less 是纯构建期依赖，产物没引用过，不进清单；node: 内置模块同样不算依赖
    expect(manifest.dependencies).toEqual({ axios: '^1.6.0', lodash: '^4.17.0' });
    expect(logged()).toMatch(/运行时依赖 2 个（根 package\.json 声明的另 1 个不写入发布清单/);
  });

  it('.mjs / .cjs 产物同样被扫到', () => {
    const root = makeRepo({ dependencies: { axios: '^1.6.0', dayjs: '^1.11.0' } });
    writeDist(root, 'index.mjs', "import axios from 'axios';\nexport { axios };\n");
    writeDist(root, 'legacy.cjs', "import dayjs from 'dayjs';\nexport { dayjs };\n");
    // 类型声明不是运行时模块，不参与扫描
    writeDist(root, 'index.d.ts', "import type { Foo } from 'never-declared';\n");

    const manifest = writeManifest({ ctx: makeCtx(root), version: '1.0.0' });
    expect(manifest.dependencies).toEqual({ axios: '^1.6.0', dayjs: '^1.11.0' });
  });

  it('产物引用了但根 package.json 没声明版本的包会告警', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', "import x from 'mystery-pkg';\nexport { x };\n");

    const manifest = writeManifest({ ctx: makeCtx(root), version: '1.0.0' });

    expect(manifest.dependencies).toBeUndefined();
    expect(logged()).toMatch(/未声明版本，无法写入 dependencies: mystery-pkg/);
  });

  it('peerDependencies 的范围从根 package.json 取，且不重复进 dependencies', () => {
    const root = makeRepo({
      peerDependencies: { vue: '^3.5.0' },
      dependencies: { vue: '^3.4.0', axios: '^1.6.0' },
    });
    writeDist(
      root,
      'index.js',
      "import { ref } from 'vue';\nimport axios from 'axios';\nexport { ref, axios };\n",
    );

    const manifest = writeManifest({
      ctx: makeCtx(root, { peerDependencies: ['vue'] }),
      version: '1.0.0',
    });

    // peerDependencies 优先于 dependencies 取范围
    expect(manifest.peerDependencies).toEqual({ vue: '^3.5.0' });
    expect(manifest.dependencies).toEqual({ axios: '^1.6.0' });
  });

  it('根 package.json 查不到 peer 的版本时直接报错，不猜', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', "import { ref } from 'vue';\nexport { ref };\n");

    expect(() =>
      writeManifest({ ctx: makeCtx(root, { peerDependencies: ['vue'] }), version: '1.0.0' }),
    ).toThrow(/未声明 vue 的版本/);
  });

  /**
   * 扫描只看得到引用形态：peer 名单里的包在产物里一次裸导入都没有时，
   * 「被打进了产物」和「压根没被 import」这两种情况分不开，所以告警得是两可的。
   */
  it('peer 名单里没被裸导入引用的包，告警如实给两可表述', () => {
    const root = makeRepo({ peerDependencies: { 'vue-i18n': '^9.0.0' } });
    writeDist(root, 'index.js', 'export const a = 1;\n');

    writeManifest({
      ctx: makeCtx(root, { peerDependencies: ['vue-i18n'] }),
      version: '1.0.0',
    });

    const output = logged();
    expect(output).toMatch(/vue-i18n 未被产物以裸导入引用/);
    expect(output).toMatch(/要么已被打进产物/);
    expect(output).toMatch(/要么压根没被 import/);
    // 不能一口咬定已打进产物
    expect(output).not.toMatch(/并未被外部化（已打进产物）/);
  });
});

// ============ 落盘 ============

describe('落盘', () => {
  it('同时写出 .npmignore 把 .build-meta.json 挡在包外', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');

    writeManifest({ ctx: makeCtx(root), version: '1.0.0' });

    expect(fs.readFileSync(path.join(root, 'dist', '.npmignore'), 'utf-8')).toContain(
      '.build-meta.json',
    );
  });

  it('没有 .build-meta.json 时 gitHead 留空并告警', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');

    const manifest = writeManifest({ ctx: makeCtx(root), version: '1.0.0' });

    expect(manifest.gitHead).toBeUndefined();
    expect(logged()).toMatch(/gitHead 将留空/);
  });

  it('脏工作区打出的产物 gitHead 带 -dirty 后缀', () => {
    const root = makeRepo();
    writeDist(root, 'index.js', 'export const a = 1;\n');
    writeDist(
      root,
      '.build-meta.json',
      JSON.stringify({ commit: 'abc1234', branch: 'master', dirty: true, builtAt: 'now' }),
    );

    const manifest = writeManifest({ ctx: makeCtx(root), version: '1.0.0' });
    expect(manifest.gitHead).toBe('abc1234-dirty');
  });
});
