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
import {
  classifyJsonFile,
  loadJsonDictOrThrow,
  safeLoadJsonFile,
  writeTranslationsFile,
} from '../src/utils/json-io';
import { previewText } from '../src/utils/text-normalize';

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

    const msgs = new LanguageFileManager(config, false).getMessages();
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

    const viaGetMessages = Object.keys(
      new LanguageFileManager(config, false).getMessages()['zh-CN']!,
    );
    const viaReadLocale = Object.keys(
      new LanguageFileManager(config, false).readLocaleFile() ?? {},
    );
    expect(viaGetMessages).toEqual(viaReadLocale);
    expect(viaReadLocale).toEqual(['views/order/title']);
  });
});

// =============================================================================
// bucket-migration-empty-source（审计 Bug #5）
// =============================================================================
/**
 * 回归：桶式迁移时若 source 文件存在但内容为空 `{}`，target 不得把全部 key 落入
 * defaultBucket。根因（修复前）：migrateToBuckets 用 `bucketingMessages ?? flatData`，
 * `??` 只挡 null/undefined——空 source 迁移返回 `{}`（非 nullish），target 拿到空 map
 * 驱动分桶 → buildKeyBucketMap({}) 为空 → 所有 key → defaultBucket，分桶规则丢失。
 * 与「source 文件不存在」分支（返回 undefined → target 回退自身 flatData）行为不对称。
 * 修复：bucketingMessages 为空对象时同样回退到 locale 自身 flatData。
 */
describe('桶式迁移：空 source {} 时 target 仍按规则分桶', () => {
  let root: string;
  let localeDir: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bucket-empty-source-'));
    localeDir = path.join(root, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const makeConfig = (): ResolvedConfig =>
    resolveConfig({
      root,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat', prettify: false },
      keys: { separator: '.' },
      buckets: {
        rules: [{ name: 'order', matchKey: (k: string) => k.startsWith('order.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } as I18nToolsConfig);

  it('source 为 {} 时，target 的 order.* key 进 order 桶而非全落 common', () => {
    // source 文件存在但内容为空 {}（合法磁盘状态，正是 bug 触发条件）
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{}');
    // target 非空：order.list 应进 order 桶，user.name 进 common 桶
    fs.writeFileSync(
      path.join(localeDir, 'en-US.json'),
      JSON.stringify({ 'order.list': 'List', 'user.name': 'Name' }),
    );

    new LanguageFileManager(makeConfig(), false).getMessages();

    // 修复后：en-US/order.json 存在且含 order.list（修复前该 key 被错落进 common）
    const orderBucket = path.join(localeDir, 'en-US', 'order.json');
    expect(fs.existsSync(orderBucket)).toBe(true);
    expect(JSON.parse(fs.readFileSync(orderBucket, 'utf-8'))).toHaveProperty('order.list');

    // common 桶里不应再混入 order.list
    const commonBucket = path.join(localeDir, 'en-US', 'common.json');
    expect(JSON.parse(fs.readFileSync(commonBucket, 'utf-8'))).not.toHaveProperty('order.list');
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

  it('writeTranslationsFile：顶层 key 字母序，内层值对象顺序不变', () => {
    const p = path.join(tmpDir, 't.json');
    writeTranslationsFile(p, {
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

// =============================================================================
// buckets 迁移窗口：readLocaleFile 兜底读遗留单文件
// =============================================================================
/**
 * Bug：存量项目（单文件 zh-CN.json 有全量 key）开启 buckets 后，迁移只挂在
 * getMessages→migrateToBuckets 链上；首条命令若是 doctor/restore/prune/generate
 * （全部走 readLocaleFile），桶式分支只扫桶目录 → 读到 {} → doctor --ci 把全部
 * key 判 missing 假失败、restore 空跑、generate 不复用历史 key 造出双套 key。
 * 修复：桶式读取时若遗留单文件存在且未迁移（无 .bak），只读并入其内容（不迁移）。
 */
describe('buckets 迁移窗口：readLocaleFile 只读并入未迁移的遗留单文件', () => {
  let root: string;
  let localeDir: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bucket-window-'));
    localeDir = path.join(root, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const makeConfig = (): ResolvedConfig =>
    resolveConfig({
      root,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat', prettify: false },
      keys: { separator: '.' },
      buckets: {
        rules: [{ name: 'order', matchKey: (k: string) => k.startsWith('order.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } as I18nToolsConfig);

  it('遗留单文件未迁移、桶目录为空：返回遗留内容而非 {}，且不触发迁移', () => {
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN.json'),
      JSON.stringify({ 'order.list': '列表', 'user.name': '名称' }),
    );

    const map = new LanguageFileManager(makeConfig(), false).readLocaleFile();
    expect(map).toEqual({ 'order.list': '列表', 'user.name': '名称' });
    // 只读兜底：不得产生迁移副作用
    expect(fs.existsSync(path.join(localeDir, 'zh-CN.json.bak'))).toBe(false);
    expect(fs.existsSync(path.join(localeDir, 'zh-CN.json'))).toBe(true);
  });

  it('同 key 冲突时桶数据优先（桶式是当前权威格式）', () => {
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ 'user.name': '旧值' }));
    fs.mkdirSync(path.join(localeDir, 'zh-CN'), { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN', 'common.json'),
      JSON.stringify({ 'user.name': '新值' }),
    );

    const map = new LanguageFileManager(makeConfig(), false).readLocaleFile();
    expect(map).toEqual({ 'user.name': '新值' });
  });

  it('遗留单文件损坏时返回 null（与单文件模式口径一致，不静默当空）', () => {
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{ 损坏的 json');

    const map = new LanguageFileManager(makeConfig(), false).readLocaleFile();
    expect(map).toBeNull();
  });

  it('已迁移（.bak 存在）时不再读遗留文件', () => {
    // 用户在迁移后又手动放回一份旧单文件的边界场景
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ stale: '过期' }));
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json.bak'), '{}');
    fs.mkdirSync(path.join(localeDir, 'zh-CN'), { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN', 'common.json'),
      JSON.stringify({ 'user.name': '值' }),
    );

    const map = new LanguageFileManager(makeConfig(), false).readLocaleFile();
    expect(map).toEqual({ 'user.name': '值' });
  });
});

// =============================================================================
// json-io — 顶层非字典守卫
// =============================================================================
/**
 * 回归：全部调用方（locale/bucket 文件、glossary、translations/untranslated）消费的都是
 * 「key → value」字典。语法合法但顶层是数组/字符串/数字时若判 ok 放行，
 * `Object.entries("hello")` 会把字符串按字符拆成条目一路加工到落盘，全程不报错。
 * 归入 corrupt（而非新增一档 status）是为了让既有 `status === 'corrupt'` 守卫照旧 fail-fast。
 */
describe('classifyJsonFile / loadJsonDictOrThrow — 顶层必须是对象', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-json-toplevel-'));
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const write = (content: string): string => {
    const p = path.join(tmpDir, 'x.json');
    fs.writeFileSync(p, content, 'utf8');
    return p;
  };

  it.each([
    ['数组', '["a","b"]'],
    ['字符串', '"hello"'],
    ['数字', '42'],
    ['布尔', 'true'],
  ])('顶层是%s → corrupt，且 reason 说明顶层必须是对象', (_label, content) => {
    const cls = classifyJsonFile(write(content));
    expect(cls.status).toBe('corrupt');
    expect(cls.status === 'corrupt' && cls.reason).toMatch(/顶层必须是对象/);
  });

  it('loadJsonDictOrThrow 抛错时带上调用方文案 + 具体原因', () => {
    expect(() => loadJsonDictOrThrow(write('"hello"'), (p) => `坏了: ${p}`)).toThrow(
      /坏了: .*[\s\S]*顶层必须是对象/,
    );
  });

  it('对照：顶层是对象照常 ok；null / 空文件仍归 empty（不回归）', () => {
    expect(classifyJsonFile(write('{"a":"1"}'))).toEqual({ status: 'ok', data: { a: '1' } });
    expect(classifyJsonFile(write('null')).status).toBe('empty');
    expect(classifyJsonFile(write('   ')).status).toBe('empty');
  });
});

// =============================================================================
// json-io — silent 读取契约与解析错因
// =============================================================================
// silent 传到 tryParseJson，探测型读取（getMessages / migrateToBuckets / findCorrupt*）
// 不再每探测一次刷一条裸报错；解析错因随 classifyJsonFile 的返回值带出。
describe('json-io — silent 读取契约与解析错因', () => {
  const withCorruptFile = <T>(fn: (file: string) => T): T => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-json-io-'));
    const file = path.join(dir, 'broken.json');
    fs.writeFileSync(file, '{ "a": 1,, }', 'utf-8');
    try {
      return fn(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('safeLoadJsonFile({ silent: true }) 对损坏文件零输出', () => {
    const errorSpy = vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    const result = withCorruptFile((file) => safeLoadJsonFile(file, { silent: true }));
    expect(result).toEqual({});
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('不传 silent 时仍照旧打印（既有行为不回退）', () => {
    const errorSpy = vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    withCorruptFile((file) => safeLoadJsonFile(file));
    expect(errorSpy).toHaveBeenCalled();
  });

  it('classifyJsonFile({ silent: true }) 不打印但把错因随返回值带出', () => {
    const errorSpy = vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    const cls = withCorruptFile((file) => classifyJsonFile(file, { silent: true }));
    expect(cls.status).toBe('corrupt');
    expect(cls.status === 'corrupt' && cls.reason).toBeTruthy();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('loadJsonDictOrThrow 的报错信息包含解析器给出的错因', () => {
    const errorSpy = vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    const message = withCorruptFile((file) => {
      try {
        loadJsonDictOrThrow(file, (p) => `坏了: ${p}`);
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(message).toContain('坏了:');
    // 语法错因（解析器 message）经 reason 透出，用户能定位「坏在哪」
    expect(message).toContain('👉');
    expect(errorSpy).toHaveBeenCalled(); // 该路径未 silent，控制台仍有原始错误
  });
});

// =============================================================================
// IdReuseResolver — 无前缀域的 key 复用
// =============================================================================
// 前缀派生结果为空串（文件不在 anchor 下 / take·transform 过滤掉全部段 / custom 返回 []）
// 时，同一原文也要能复用「同样无前缀」的历史 key，否则每轮 generate 都重新分配。
describe('IdReuseResolver — 无前缀域的 key 复用', () => {
  const withProject = <T>(locale: Record<string, string>, fn: (root: string) => T): T => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-reuse-'));
    fs.mkdirSync(path.join(root, 'src', 'i18n'), { recursive: true });
    fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'i18n', 'zh-CN.json'), JSON.stringify(locale), 'utf-8');
    try {
      return fn(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };

  const resolverFor = (root: string): IdReuseResolver =>
    new IdReuseResolver(
      resolveConfig({ root, framework: { type: 'vue' }, io: { format: 'flat' } }),
      false,
    );

  it('复用无前缀历史 key（anchor 之外的文件）', () => {
    withProject({ submitBtn: '提交' }, (root) => {
      const resolver = resolverFor(root);
      const outside = path.join(root, 'lib', 'foo.vue');
      // 前置事实：该文件派生不出前缀
      expect(resolver.getIdGenerator().getDirectoryPrefix(outside)).toBe('');
      expect(resolver.pickReusableKey('提交', outside)).toBe('submitBtn');
    });
  });

  it('不跨域复用带前缀的历史 key（acrossDirectories=false 时仍隔离）', () => {
    withProject({ 'pages.order.submitBtn': '提交' }, (root) => {
      const resolver = resolverFor(root);
      const outside = path.join(root, 'lib', 'foo.vue');
      expect(resolver.pickReusableKey('提交', outside)).toBeUndefined();
    });
  });

  it('同前缀域内的既有行为不变', () => {
    withProject({ 'pages.submitBtn': '提交' }, (root) => {
      const resolver = resolverFor(root);
      const inside = path.join(root, 'src', 'pages', 'foo.vue');
      expect(resolver.pickReusableKey('提交', inside)).toBe('pages.submitBtn');
    });
  });
});

// =============================================================================
// 文本工具 — containsChinese / isValidTranslation / previewText
// =============================================================================
describe('文本工具 — containsChinese / isValidTranslation / previewText', () => {
  it('containsChinese 单参签名', () => {
    expect(FileUtils.containsChinese('你好 world')).toBe(true);
    expect(FileUtils.containsChinese('hello')).toBe(false);
    expect(FileUtils.containsChinese('')).toBe(false);
  });

  it('isValidTranslation 纯标点仍无效、正常译文仍有效', () => {
    expect(FileUtils.isValidTranslation('...')).toBe(false);
    expect(FileUtils.isValidTranslation('{}')).toBe(false);
    expect(FileUtils.isValidTranslation('  ')).toBe(false);
    expect(FileUtils.isValidTranslation('Hello')).toBe(true);
    expect(FileUtils.isValidTranslation('第1项')).toBe(true);
    expect(FileUtils.isValidTranslation(null)).toBe(false);
  });

  it('previewText：单行化 + 80 截断', () => {
    expect(previewText('a\n  b\tc')).toBe('a b c');
    const long = '汉'.repeat(81);
    expect(previewText(long)).toBe(`${'汉'.repeat(80)}…`);
    expect(previewText('汉'.repeat(80))).toBe('汉'.repeat(80));
  });
});

// =============================================================================
// 四轮审计 P3：IO 侧一致性（A10 / A11 / A14）
// =============================================================================
/**
 * A10：translations.json / untranslated.json 与语言文件必须同一套缩进，否则项目把
 * io.indent 配成 4 之后，这两类文件每次落盘都互相打架出全量 diff。
 * A11：扩展名匹配不区分大小写（source-key-scanner 的 hasExtension 已 toLowerCase，
 * 两侧口径分裂会让 `Foo.VUE` 一边被扫、一边扫不到）。
 * A14：readBucketedLocaleWithBucketMap 与 readBucketedLocaleFlat 同为 null 原型累加器，
 * 否则 `__proto__` 这个合法末段 key 在前者里被 setter 静默吞掉。
 */
describe('IO 一致性（四轮审计 P3）', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'io-consistency-'));
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

  it('A10：pick 写出的字典文件跟随 config.io.indent', async () => {
    fs.writeFileSync(path.join(localeDir, 'zh.json'), JSON.stringify({ 'a.x': '甲' }));
    fs.writeFileSync(path.join(localeDir, 'en.json'), JSON.stringify({}));
    const config = resolveConfig({
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat', indent: 4 },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

    await new PickProcessor(config, false).execute();

    const raw = fs.readFileSync(path.join(localeDir, 'untranslated.json'), 'utf8');
    expect(raw).toMatch(/\n {4}"a\.x"/);
  });

  it('A10：writeTranslationsFile 未传 indent 时保持 2 空格默认', () => {
    const p = path.join(tmpDir, 't.json');
    writeTranslationsFile(p, { 'a.x': { zh: '甲' } });
    expect(fs.readFileSync(p, 'utf8')).toMatch(/\n {2}"a\.x"/);
  });

  it('A11：matchesExtensions 不区分大小写（.VUE 与 .vue 同一个文件）', () => {
    expect(FileUtils.matchesExtensions('Foo.VUE', ['.vue'])).toBe(true);
    expect(FileUtils.matchesExtensions('Foo.vue', ['.VUE'])).toBe(true);
    expect(FileUtils.matchesExtensions('Foo.ts', ['.vue'])).toBe(false);
    // 类型声明文件仍被排除
    expect(FileUtils.matchesExtensions('types.d.ts', ['.ts'])).toBe(false);
  });

  it('A14：readBucketedLocaleWithBucketMap 保住 __proto__ 末段 key', () => {
    const config = resolveConfig({
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      buckets: {
        rules: [{ name: 'pages', matchKey: (k: string) => k.startsWith('pages.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);
    fs.mkdirSync(path.join(localeDir, 'zh'), { recursive: true });
    // 手写 JSON 文本：对象字面量里的 `__proto__:` 是原型设值语法，写不出这个自有属性
    fs.writeFileSync(
      path.join(localeDir, 'zh', 'common.json'),
      '{"__proto__":"原型名 key","normal":"普通"}',
    );

    const { flat, keyBucketMap } = new LanguageFileManager(
      config,
      false,
    ).readBucketedLocaleWithBucketMap('zh');

    expect(Object.keys(flat).sort()).toEqual(['__proto__', 'normal']);
    expect(flat['__proto__']).toBe('原型名 key');
    expect(keyBucketMap['__proto__']).toBe('common');
  });
});
