import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FileUtils } from '../src/utils/file-utils';
import { LanguageFileManager } from '../src/utils/language-file-manager';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import { PickProcessor } from '../src/core/PickProcessor';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { ExportProcessor } from '../src/core/ExportProcessor';
import { IdGenerator } from '../src/utils/id-generator';
import { IdReuseResolver } from '../src/core/IdReuseResolver';
import { isModeExplicitlySet } from '../src/utils/command-utils';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

// =============================================================================
// file-utils
// =============================================================================
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

// =============================================================================
// flatten-separator-consistency
// =============================================================================
/**
 * 回归（#12）：读路径的 flattenObject 必须使用 config.keys.separator。
 *
 * 根因（修复前）：getMessages / migrateToBuckets / readBucketedLocaleWithBucketMap 调用
 * flattenObject(data) 用默认分隔符 '.'，而 readLocaleFile / readBucketedLocaleFlat 传了
 * config.keys.separator。flat 格式 + 非 '.' 分隔符 + 磁盘是嵌套 JSON 时，两族读路径得到
 * 不同 flat key 集（a/b vs a.b），令 prune/merge 误判孤儿。
 */
describe('flattenObject 读路径使用 keys.separator', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'flatten-sep-'));
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('getMessages 用配置的非 "." 分隔符展平嵌套 JSON', () => {
    const localeDir = path.join(root, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    // 磁盘是嵌套 JSON；flat 格式 + 分隔符 '/'
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ a: { b: '你好' } }));

    const config = resolveConfig({
      root,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN' },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '/' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } as I18nToolsConfig);

    const msgs = LanguageFileManager.getMessages(config, false);
    // 修复前会得到 'a.b'（默认分隔符），与 readLocaleFile('/') 的 key 集不一致
    expect(Object.keys(msgs['zh-CN']!)).toEqual(['a/b']);
    expect(msgs['zh-CN']!['a/b']).toBe('你好');
  });

  it('与 readLocaleFile 的 key 集一致（往返安全路径同源）', () => {
    const localeDir = path.join(root, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN.json'),
      JSON.stringify({ views: { order: { title: '订单' } } }),
    );
    const config = resolveConfig({
      root,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN' },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '/' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } as I18nToolsConfig);

    const viaGetMessages = Object.keys(LanguageFileManager.getMessages(config, false)['zh-CN']!);
    const viaReadLocale = Object.keys(LanguageFileManager.readLocaleFile(config, false) ?? {});
    expect(viaGetMessages).toEqual(viaReadLocale);
    expect(viaReadLocale).toEqual(['views/order/title']);
  });
});

// =============================================================================
// translations-order
// =============================================================================
/**
 * 回归：translations.json / untranslated.json 落盘必须按 key 字母序，
 * 使顺序与「哪个步骤最后写」解耦。否则 pick（源序）与 merge（已有 + 末尾追加）
 * 顺序不一致，跑一次 pick 就把 merge 追加的 key 重排回中部，产生大 no-op diff。
 */
describe('translations/untranslated 落盘按 key 排序', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-order-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeConfig(): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  }

  it('FileUtils.writeTranslationsFile：顶层 key 字母序，内层值对象顺序不变', () => {
    const p = path.join(tmpDir, 't.json');
    FileUtils.writeTranslationsFile(p, {
      'm.x': { zh: '乙', en: 'B' },
      'a.x': { zh: '甲', en: 'A' },
    });
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(Object.keys(parsed)).toEqual(['a.x', 'm.x']);
    expect(Object.keys(parsed['a.x'])).toEqual(['zh', 'en']); // 内层不被打乱
  });

  it('pick 写出的 translations.json 按 key 排序（与源文件输入顺序无关）', async () => {
    fs.writeFileSync(
      path.join(localeDir, 'zh.json'),
      JSON.stringify({ 'm.x': '乙', 'a.x': '甲', 'c.x': '丙' }),
    );
    fs.writeFileSync(
      path.join(localeDir, 'en.json'),
      JSON.stringify({ 'm.x': 'B', 'a.x': 'A', 'c.x': 'C' }),
    );

    await new PickProcessor(makeConfig(), false).execute();

    const trans = JSON.parse(fs.readFileSync(path.join(localeDir, 'translations.json'), 'utf8'));
    expect(Object.keys(trans)).toEqual(['a.x', 'c.x', 'm.x']);
  });

  it('merge 写回的 translations.json 按 key 排序（新 key 不再追加到末尾）', async () => {
    // 已有翻译故意乱序；untranslated 有一个已填好待晋升的 key（排序后应落在中间）
    fs.writeFileSync(
      path.join(localeDir, 'translations.json'),
      JSON.stringify({ 'm.x': { zh: '乙', en: 'B' }, 'a.x': { zh: '甲', en: 'A' } }),
    );
    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify({ 'f.x': { zh: '丙', en: 'F' } }),
    );

    await new MergeProcessor(makeConfig(), false).execute();

    const trans = JSON.parse(fs.readFileSync(path.join(localeDir, 'translations.json'), 'utf8'));
    // 旧行为 [m.x, a.x, f.x]（existing + append）；修复后排序 [a.x, f.x, m.x]
    expect(Object.keys(trans)).toEqual(['a.x', 'f.x', 'm.x']);
  });
});

// =============================================================================
// id-generator-filename-case-anchor-root
// =============================================================================
/**
 * 回归（B6）：PathStrategy 中「文件直接位于 anchor 下」的退化分支用原始文件名作单段前缀，
 * 未应用 fileNameCase；而子目录文件的 includeFile 分支会应用。导致顶层文件与子目录文件
 * 的前缀大小写规则不一致（fileNameCase:'kebab' 下 src/MyView.vue → 'MyView' 而非 'my-view'）。
 * 修复：退化分支同样 applyCase。
 */
describe('IdGenerator - anchor 根文件应用 fileNameCase', () => {
  function buildConfig(overrides: Partial<I18nToolsConfig> = {}) {
    const user: I18nToolsConfig = {
      root: '/tmp/proj',
      framework: { type: 'vue' },
      llm: { shared: { apiKey: 'sk-test', model: 'gpt-4o' } },
      ...overrides,
    };
    return resolveConfig(user);
  }

  it('fileNameCase=kebab：顶层 MyView.vue 前缀走 kebab（修复前为原样 MyView）', () => {
    const gen = new IdGenerator(
      buildConfig({ keys: { prefix: { strategy: 'path', fileNameCase: 'kebab' } } }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/MyView.vue', '提交', new Set());
    expect(id).toBe('my-view.submit');
  });

  it('与子目录文件的 fileNameCase 规则一致', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: { prefix: { strategy: 'path', fileNameCase: 'kebab', includeFile: true } },
      }),
    );
    const top = gen.generateWithFilePath('/tmp/proj/src/MyView.vue', '提交', new Set());
    const nested = gen.generateWithFilePath('/tmp/proj/src/pages/MyView.vue', '提交', new Set());
    // 两者文件名段都应为 kebab 化的 my-view
    expect(top).toContain('my-view');
    expect(nested).toContain('my-view');
  });
});

// =============================================================================
// promote-to-common
// =============================================================================
describe('IdReuseResolver — promoteToCommon', () => {
  const buildConfig = (
    overrides: Partial<{
      promoteToCommon: { threshold: number; namespace: string };
      acrossDirectories: boolean;
    }> = {},
    localesDir = '',
  ): ResolvedConfig => {
    const user: I18nToolsConfig = {
      root: '/tmp/proj',
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir, format: 'flat' },
      keys: {
        separator: '.',
        reuse: {
          acrossDirectories: overrides.acrossDirectories ?? false,
          promoteToCommon: overrides.promoteToCommon,
        },
      },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  };

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-common-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const writeLocale = (entries: Record<string, string>): string => {
    const dir = path.join(tmpDir, 'locale');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'zh-CN.json'), JSON.stringify(entries));
    return dir;
  };

  it('未配置 promoteToCommon → 永不提升', () => {
    const config = buildConfig(
      {},
      writeLocale({
        'pages.foo.save': '保存',
        'pages.bar.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/tmp/proj/src/pages/baz/file.vue')).toBe(false);
  });

  it('threshold < 2 → 视为禁用', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 1, namespace: 'common' } },
      writeLocale({ 'pages.foo.save': '保存' }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/tmp/proj/src/pages/bar/file.vue')).toBe(false);
  });

  it('已有 2 个前缀 + 阈值 3 + 第 3 个新前缀 → 触发提升', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 3, namespace: 'common' } },
      writeLocale({
        'pages.foo.save': '保存',
        'pages.bar.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/tmp/proj/src/pages/baz/file.vue')).toBe(true);
  });

  it('当前文件前缀已存在于集合中 → 不提升（同模块重复使用）', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 3, namespace: 'common' } },
      writeLocale({
        'pages.foo.save': '保存',
        'pages.bar.save': '保存',
        'pages.baz.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.shouldPromoteToCommon('保存', '/tmp/proj/src/pages/foo/another.vue')).toBe(
      false,
    );
  });

  it('getCommonNamespace 返回配置值', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 2, namespace: 'shared' } },
      writeLocale({}),
    );
    const resolver = new IdReuseResolver(config, false);
    expect(resolver.getCommonNamespace()).toBe('shared');
  });

  it('已提升到 common 的 key 跨目录可复用，避免后续生成 common.X_1/_2', () => {
    const config = buildConfig(
      { promoteToCommon: { threshold: 3, namespace: 'common' } },
      writeLocale({
        'pages.foo.save': '保存',
        'pages.bar.save': '保存',
        'common.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.pickReusableKey('保存', '/tmp/proj/src/pages/qux/file.vue')).toBe(
      'common.save',
    );
  });

  it('未启用 promoteToCommon 时 common-namespace 命中规则不触发', () => {
    const config = buildConfig(
      {},
      writeLocale({
        'pages.foo.save': '保存',
        'common.save': '保存',
      }),
    );

    const resolver = new IdReuseResolver(config, false);
    expect(resolver.pickReusableKey('保存', '/tmp/proj/src/pages/qux/file.vue')).toBeUndefined();
  });
});

// =============================================================================
// exclude-path-glob
// =============================================================================
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

// =============================================================================
// export-flat-separator
// =============================================================================
/**
 * 回归：flat 导出读路径必须用 config.keys.separator 展平（与 flatten-separator-consistency #12 同类）。
 *
 * 根因：ExportProcessor.performFlatExport 的 loadFlat 调 flattenObject(raw) 漏传 separator，
 * 默认用 '.'。flat 格式 + 非 '.' 分隔符 + 磁盘嵌套 JSON 时，导出包 key（a.b）与运行时/源码使用的
 * key（a/b）不一致 → 导出包整片 missing-key 兜底。文末自检因 key 数量相同而静默放行。
 */
describe('ExportProcessor flat 导出使用 keys.separator', () => {
  let rootDir: string;
  let baseDir: string;
  let outDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(rootDir, 'src'),
        localesDir: baseDir,
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '/' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-flat-sep-'));
    baseDir = path.join(rootDir, 'locale');
    outDir = path.join(rootDir, 'out');
    fs.mkdirSync(baseDir, { recursive: true });
    // 磁盘是嵌套 JSON；flat 格式 + 分隔符 '/'
    fs.writeFileSync(
      path.join(baseDir, 'zh-CN.json'),
      JSON.stringify({ views: { order: { title: '订单' } } }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(baseDir, 'en-US.json'),
      JSON.stringify({ views: { order: { title: 'Order' } } }),
      'utf-8',
    );
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('导出 key 用配置的 "/" 分隔符，而非默认 "."', async () => {
    await new ExportProcessor(buildConfig()).execute(outDir);

    const exported = JSON.parse(fs.readFileSync(path.join(outDir, 'zh-CN.json'), 'utf-8'));
    expect(Object.keys(exported)).toEqual(['views/order/title']);
    expect(exported['views/order/title']).toBe('订单');
    // 修复前会得到 'views.order.title'（默认分隔符），与运行时/源码 key 集不一致
    expect(Object.keys(exported)).not.toContain('views.order.title');
  });
});

// =============================================================================
// command-utils
// =============================================================================
describe('isModeExplicitlySet', () => {
  it('识别所有显式指定 mode 的写法（含短选项贴值）', () => {
    expect(isModeExplicitlySet(['--mode', 'generate'])).toBe(true);
    expect(isModeExplicitlySet(['--mode=generate'])).toBe(true);
    expect(isModeExplicitlySet(['-m', 'generate'])).toBe(true);
    expect(isModeExplicitlySet(['-m=generate'])).toBe(true); // 旧逻辑漏报
    expect(isModeExplicitlySet(['-mgenerate'])).toBe(true); // 旧逻辑漏报
  });

  it('未指定 mode 时返回 false', () => {
    expect(isModeExplicitlySet([])).toBe(false);
    expect(isModeExplicitlySet(['-i'])).toBe(false);
    expect(isModeExplicitlySet(['--custom', '--ci'])).toBe(false);
    expect(isModeExplicitlySet(['--config', './i18n.config.ts'])).toBe(false);
  });
});
