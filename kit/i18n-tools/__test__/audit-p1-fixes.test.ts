import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FileProcessor } from '../src/core/FileProcessor';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { PickProcessor } from '../src/core/PickProcessor';
import { PruneProcessor } from '../src/core/PruneProcessor';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import { VueAdapter } from '../src/adapters/VueAdapter';
import { resolveConfig } from '../src/config/loader';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { VueRestoreTransformer } from '../src/strategies/vue/VueRestoreTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import { FileUtils } from '../src/utils/file-utils';
import { LoggerUtils } from '../src/utils/logger';
import { loadEnv } from '../src/utils/env';
import { RunReport } from '../src/utils/run-report';
import { extractPlaceholderNames } from '../src/utils/placeholder-utils';
import { toSingleBracePlaceholders } from '../src/utils/message-shape';
import { getTranslationSystemPrompt, getTranslationUserPrompt } from '../src/utils/prompts';
import type { I18nToolsConfig, ResolvedConfig, ResolvedLLMTaskConfig } from '../src/config';
import { classifyJsonFile, loadJsonDictOrThrow } from '../src/utils/json-io';

/**
 * 2026-08 全库审计确认的 P1 修复回归集。每个 describe 固定一个「漏提取 / 漏还原 /
 * 伪成功 / 静默降级」的已修缺陷，防止回潮。
 */

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-p1-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const write = (rel: string, content: string): string => {
  const abs = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
};

// ---------------------------------------------------------------------------
// #1 Vue v-pre 判定：属性值里的 `v-pre` 让整棵子树漏提取
// ---------------------------------------------------------------------------
describe('Vue extract — v-pre 判定先剥属性值', () => {
  it('属性值含空白分隔的 v-pre 时，子树文本仍被提取', async () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const fp = write(
      'VPre.vue',
      `<template>\n  <div :data-tip="'enable v-pre mode'">提交订单</div>\n</template>\n`,
    );
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    expect(strings.map((s) => s.original)).toContain('提交订单');
  });

  it('对照：真正的 v-pre 指令仍跳过整棵子树（不回归）', async () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const fp = write(
      'VPre2.vue',
      `<template>\n  <div v-pre>{{ raw }} 原样文本</div>\n</template>\n`,
    );
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    expect(strings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// #2 技术属性中的中文：行为仍是跳过，但必须留痕（此前零诊断）
// ---------------------------------------------------------------------------
describe('Vue extract — 技术属性中文跳过时留痕', () => {
  it('value="提交" 不提取，但产出 warning', async () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    const fp = write('Tech.vue', `<template>\n  <el-option value="提交" />\n</template>\n`);
    const extractor = adapter.getTextExtractor();
    const strings = await extractor.extractFromFile(fp);

    expect(strings).toHaveLength(0);
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('跳过技术属性中的中文'))).toBe(
      true,
    );
    // 同步进 RunReport 通道（drainWarnings），便于事后回查
    expect(extractor.drainWarnings().some((w) => w.includes('跳过技术属性中的中文'))).toBe(true);
  });

  it('对照：非技术属性中文照常提取，不产生该 warning（不回归）', async () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    const fp = write('Tech2.vue', `<template>\n  <el-option label="确定" />\n</template>\n`);
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    expect(strings.map((s) => s.original)).toContain('确定');
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('跳过技术属性中的中文'))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// #3 React 混合内容绕过 filterPatterns：合成消息此前直接 push，用户黑名单形同虚设
// ---------------------------------------------------------------------------
describe('React extract — 混合内容也过业务 filterPatterns', () => {
  it('filterPatterns 命中合成串时不提取', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {
      filterPatterns: [/共 \$\{count\} 项/],
    });
    const fp = write('Mix.tsx', `export const C = () => (\n  <div>共 {count} 项</div>\n);\n`);
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    expect(strings.map((s) => s.original)).not.toContain('`共 ${count} 项`');
  });

  it('对照：无 filterPatterns 时合并提取照常（不回归）', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const fp = write('Mix2.tsx', `export const C = () => (\n  <div>共 {count} 项</div>\n);\n`);
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    expect(strings.map((s) => s.original)).toContain('`共 ${count} 项`');
  });
});

// ---------------------------------------------------------------------------
// #4 JsxFragment 混合内容：此前只判 JsxElement，Fragment 被拆成碎 key
// ---------------------------------------------------------------------------
describe('React extract — Fragment 的混合内容合并为一条', () => {
  it('<>共 {count} 项</> 合并成含占位符的单条提取，并可正确转换', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const src = `export const C = () => (\n  <>共 {count} 项</>\n);\n`;
    const fp = write('Frag.tsx', src);
    const strings = await adapter.getTextExtractor().extractFromFile(fp);

    expect(strings).toHaveLength(1);
    expect(strings[0]!.original).toBe('`共 ${count} 项`');
    expect(strings[0]!.templateVariables).toEqual(['count']);

    // 转换端同样要认 Fragment：只替换 children 区间，Fragment 标签本身保留
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(fp, strings, src);
    expect(out).toContain('<><Trans i18nKey="k0"');
    expect(out).toContain('</>');
    expect(out).not.toContain('共 {count} 项');
  });
});

// ---------------------------------------------------------------------------
// #5 插值内嵌 JSX：合并会产出 values={{ ok: ok && <b/> }} → 渲染 [object Object]
// ---------------------------------------------------------------------------
describe('React extract — 插值内嵌 JSX 时放弃合并', () => {
  it('状态 {ok && <b>正常</b>} 不合并，退回按节点各自提取并告警', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    const fp = write(
      'JsxIn.tsx',
      `export const C = () => (\n  <div>状态 {ok && <b>正常</b>}</div>\n);\n`,
    );
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    const originals = strings.map((s) => s.original);

    // 合成串（会把 JSX 塞进 values）绝不出现
    expect(originals.some((o) => o.includes('${ok && <b>'))).toBe(false);
    // 嵌套元素里的中文不再零诊断：走保守路径后被独立提取
    expect(originals).toContain('状态');
    expect(originals).toContain('正常');
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('插值内嵌 JSX'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #6 模块路径字面量：require / 动态 import / export-from 此前会被提取替换成 t()
// ---------------------------------------------------------------------------
describe('提取排除 — 调用形式的模块路径', () => {
  it("require('./中文目录/工具') / await import('./帮助文档') / export * from 都不提取", async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const fp = write(
      'Mod.tsx',
      `const a = require('./中文目录/工具');\n` +
        `const b = async () => await import('./帮助文档');\n` +
        `export * from './导出目录';\n`,
    );
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    // 替换任一模块路径都会让运行时按译文 resolve → MODULE_NOT_FOUND
    expect(strings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// #7 兜底伪成功：损坏 JSON 时 Merge / Prune / Pick 必须抛错而非 exit 0
// ---------------------------------------------------------------------------
describe('损坏 JSON — 三个 Processor 抛错而非静默成功', () => {
  const buildConfig = (): ResolvedConfig => {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  };

  beforeEach(() => {
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'locale'), { recursive: true });
  });

  it('Merge：target locale 解析失败时抛错（此前 log+return，本轮译文全丢却 exit 0）', () => {
    const config = buildConfig();
    fs.writeFileSync(path.join(tmpDir, 'locale', 'en-US.json'), '{ 坏的');
    const proc = new MergeProcessor(config, false);
    // 直接打这条兜底分支：顶层 assertLocalesNotCorrupt 是主守卫，这里固定的是
    // 「主守卫被绕过时仍不得静默返回」的 safety net 语义。
    expect(() =>
      (
        proc as unknown as { updateFlatLanguagePackage(t: object, l: string): void }
      ).updateFlatLanguagePackage({}, 'en-US'),
    ).toThrow(/目标语言文件解析失败/);
  });

  it('Prune：字典文件损坏时抛错（此前 silent 降级为 {} → 报「无需清理」）', async () => {
    const config = buildConfig();
    fs.writeFileSync(path.join(tmpDir, 'src', 'A.vue'), `<template>{{ t('used') }}</template>\n`);
    fs.writeFileSync(
      path.join(tmpDir, 'locale', 'zh-CN.json'),
      JSON.stringify({ used: '在用', orphan: '孤儿' }),
    );
    fs.writeFileSync(path.join(tmpDir, 'locale', 'en-US.json'), JSON.stringify({}));
    fs.writeFileSync(FileUtils.getTranslatedPath(config, false), '{ 坏的');

    await expect(
      new PruneProcessor(config, false, undefined, { dryRun: false, ci: true }).execute(),
    ).rejects.toThrow(/字典文件解析失败/);
  });

  it('Pick：安全闸读 translations.json 损坏时抛错（此前 silent 降级 → 覆写销毁）', async () => {
    const config = buildConfig();
    // 源 locale 合法但为空 → 触发安全闸，闸内读 translations.json
    fs.writeFileSync(path.join(tmpDir, 'locale', 'zh-CN.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(tmpDir, 'locale', 'en-US.json'), JSON.stringify({}));
    fs.writeFileSync(FileUtils.getTranslatedPath(config, false), '{ 坏的');

    await expect(new PickProcessor(config, false).execute()).rejects.toThrow(/已翻译文件解析失败/);
  });
});

// ---------------------------------------------------------------------------
// #8 自定义 prompt：system 不做模板填充 → 所有语种拿到同一份 prompt
// ---------------------------------------------------------------------------
describe('prompts — 自定义模板的占位符填充', () => {
  const locales: ResolvedConfig['locales'] = {
    source: 'zh-CN',
    targets: ['en-US', 'ja-JP'],
    names: {},
  };

  it('自定义 system 含 {targetLocale} 时，不同语种得到不同 prompt', () => {
    const task = {
      prompt: { system: 'Translate into {targetLocale} ({targetName}) from {sourceLocale}.' },
    } as ResolvedLLMTaskConfig;
    expect(getTranslationSystemPrompt(locales, task, 'en-US')).toBe(
      'Translate into en-US (English) from zh-CN.',
    );
    expect(getTranslationSystemPrompt(locales, task, 'ja-JP')).toBe(
      'Translate into ja-JP (Japanese) from zh-CN.',
    );
  });

  it('自定义 user 缺 {jsonText} 时告警（待翻译数据会被静默丢弃）', () => {
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    const task = {
      prompt: { user: `translate to {targetLocale} ${Date.now()}` },
    } as ResolvedLLMTaskConfig;
    getTranslationUserPrompt('{"k":{}}', locales, task, 'en-US');
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('{jsonText}'))).toBe(true);
  });

  it('对照：含 {jsonText} 的自定义 user 正常填充且不告警（不回归）', () => {
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    const task = { prompt: { user: 'data: {jsonText}' } } as ResolvedLLMTaskConfig;
    expect(getTranslationUserPrompt('{"k":{}}', locales, task, 'en-US')).toBe('data: {"k":{}}');
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('{jsonText}'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #9 stripNamespacePrefix 无条件剥冒号前缀 → key 自带冒号时 lookup 落空 / 假命中
// ---------------------------------------------------------------------------
describe('react-i18next — namespace 前缀按配置剥离', () => {
  const restore = (code: string, localeMap: Record<string, string>, namespace?: string): string => {
    const lib = createReactI18nLibrary('react-i18next', { namespace });
    const file = write(`NS-${namespace ?? 'none'}-${Math.random()}.tsx`, code);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, localeMap);
  };

  const src = (key: string): string =>
    `import { useTranslation } from 'react-i18next';\n` +
    `export function C() {\n` +
    `  const { t } = useTranslation();\n` +
    `  return <div>{t('${key}')}</div>;\n` +
    `}\n`;

  it('未配置 namespace 时 t("a:b") 的 lookup key 保持 a:b', () => {
    // 剥成 'b' 会导致漏还原；撞上同名 key 更会还原成别的文案
    expect(restore(src('a:b'), { 'a:b': '冒号键' })).toContain('冒号键');
    expect(restore(src('a:b'), { b: '错误命中' })).not.toContain('错误命中');
  });

  it('配置 namespace=common 时 common:x 剥为 x、other:x 不剥', () => {
    expect(restore(src('common:x'), { x: '通用' }, 'common')).toContain('通用');
    expect(restore(src('other:x'), { x: '通用' }, 'common')).not.toContain('通用');
  });
});

// ---------------------------------------------------------------------------
// #10 warnings-only 运行打「失败报告已写入」→ 读者误判本次跑挂了
// ---------------------------------------------------------------------------
describe('FileProcessor — 报告落盘文案按有无失败分档', () => {
  class ProbeProcessor extends FileProcessor {
    constructor(
      config: ResolvedConfig,
      private readonly emit: (report: RunReport) => void,
    ) {
      super(config, false);
    }
    protected getOperationName(): string {
      return '探针';
    }
    protected getCommandName(): string {
      return 'probe';
    }
    async run(): Promise<void> {
      return this.executeWithLifecycle(() => {
        this.emit(this.report);
      });
    }
  }

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: tmpDir,
      framework: { type: 'vue', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    });

  it('仅有告警时打「运行报告已写入」（info），不打「失败报告」', async () => {
    const infoSpy = vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});

    await new ProbeProcessor(buildConfig(), (report) => report.addWarning('仅告警')).run();

    expect(infoSpy.mock.calls.some((c) => String(c[0]).includes('运行报告已写入'))).toBe(true);
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('失败报告已写入'))).toBe(false);
  });

  it('对照：真有失败时仍打「失败报告已写入」（warn）（不回归）', async () => {
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});

    await new ProbeProcessor(buildConfig(), (report) =>
      report.addFailure({ stage: 'transform', file: 'a.vue', error: new Error('x') }),
    ).run();

    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('失败报告已写入'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #11 Vue restore：空串译值被 `||` 当成缺 key，源码永远卡着 $t 调用
// ---------------------------------------------------------------------------
describe('Vue restore — 空串译值可被还原', () => {
  const lib = new VueI18nLibraryImpl();

  it('模板插值：locale 值为 "" 时还原成空串而非保留 $t', () => {
    const out = VueRestoreTransformer.restoreVueFile(
      `<template>\n  <div>{{ $t('m.blank') }}</div>\n</template>\n`,
      { 'm.blank': '' },
      lib,
      '@/locale',
    );
    expect(out).toContain('<div></div>');
    expect(out).not.toContain('$t');
  });

  it('script 段：locale 值为 "" 时 t 调用被还原成空串字面量', () => {
    const out = VueRestoreTransformer.restoreVueFile(
      `<script setup>\nimport { t } from '@/locale';\nconst m = t('m.blank');\n</script>\n`,
      { 'm.blank': '' },
      lib,
      '@/locale',
    );
    expect(out).not.toContain("t('m.blank')");
  });
});

// ---------------------------------------------------------------------------
// #12 classifyJsonFile：内容为合法 `null` 的文件被 safeParseJson 的 null 双关误判 corrupt
// ---------------------------------------------------------------------------
describe('classifyJsonFile — 合法 null 不算损坏', () => {
  it('内容为 null 的文件归类为 empty，loadJsonDictOrThrow 不抛错', () => {
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    const file = write('null.json', 'null');
    expect(classifyJsonFile(file).status).toBe('empty');
    expect(loadJsonDictOrThrow(file, () => 'should not throw')).toEqual({});
  });

  it('对照：真正损坏的 JSON 仍判 corrupt 并抛错（不回归）', () => {
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    const file = write('bad.json', '{ 坏的');
    expect(classifyJsonFile(file).status).toBe('corrupt');
    expect(() => loadJsonDictOrThrow(file, () => 'corrupt!')).toThrow('corrupt!');
  });
});

// ---------------------------------------------------------------------------
// #13 getFrameworkFiles：软链目录被 Dirent.isDirectory() 判 false 静默跳过
// ---------------------------------------------------------------------------
describe('getFrameworkFiles — 跟随软链', () => {
  it('软链目录内的文件被扫描到', () => {
    write('real/Deep.vue', '<template><div>你好</div></template>\n');
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.symlinkSync(path.join(tmpDir, 'real'), path.join(tmpDir, 'src', 'linked'), 'dir');

    const files = FileUtils.getFrameworkFiles(path.join(tmpDir, 'src'), ['.vue']);
    expect(files.some((f) => f.endsWith(path.join('linked', 'Deep.vue')))).toBe(true);
  });

  it('指回祖先目录的循环软链不导致无限递归', () => {
    write('src/A.vue', '<template><div>你好</div></template>\n');
    fs.symlinkSync(path.join(tmpDir, 'src'), path.join(tmpDir, 'src', 'loop'), 'dir');

    const files = FileUtils.getFrameworkFiles(path.join(tmpDir, 'src'), ['.vue']);
    expect(files).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// #14 loadEnv 无边界向上爬：会把主目录 / 其它项目的 .env 加载进来
// ---------------------------------------------------------------------------
describe('loadEnv — 爬升止于项目边界', () => {
  it('越过含 package.json 的目录后不再上溯（不读上层 .env）', () => {
    const varName = `AUDIT_P1_OUTSIDE_${Date.now()}`;
    fs.writeFileSync(path.join(tmpDir, '.env'), `${varName}=leaked\n`);
    const pkgDir = path.join(tmpDir, 'packages', 'app');
    fs.mkdirSync(path.join(pkgDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{}');

    loadEnv(path.join(pkgDir, 'sub'));
    expect(process.env[varName]).toBeUndefined();
  });

  it('对照：边界层自身的 .env 仍会被加载（不回归）', () => {
    const varName = `AUDIT_P1_INSIDE_${Date.now()}`;
    const pkgDir = path.join(tmpDir, 'packages', 'app2');
    fs.mkdirSync(path.join(pkgDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(pkgDir, '.env'), `${varName}=ok\n`);

    loadEnv(path.join(pkgDir, 'sub'));
    expect(process.env[varName]).toBe('ok');
    delete process.env[varName];
  });
});

// ---------------------------------------------------------------------------
// #15 占位符名字符集三处不一致：一侧识别得出的占位符在另一侧「不是占位符」
// ---------------------------------------------------------------------------
describe('占位符名字符集 — 采集端与 restore 归一端同源', () => {
  it('含 $ 与 - 的占位符名两端都识别', () => {
    // 采集端（doctor / translate 的名集比对）
    expect(extractPlaceholderNames('a {$route} b {my-var} c')).toEqual(
      new Set(['$route', 'my-var']),
    );
    // restore 归一端（双花括号 → 单花括号）
    expect(toSingleBracePlaceholders('a {{$route}} b {{my-var}}')).toBe('a {$route} b {my-var}');
  });
});

// ---------------------------------------------------------------------------
// #16 VueComponentInjector：先删 `//` 再删字符串 → 同行 URL 吞掉后续 t() 检测
// ---------------------------------------------------------------------------
describe('Vue inject — 同行 URL 字符串不吞掉 t() 检测', () => {
  it("const url = 'https://a.com'; const msg = t('k0') 同行时仍注入 t", () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const code =
      `<template>\n  <div>x</div>\n</template>\n` +
      `<script setup>\nconst url = 'https://a.com'; const msg = t('k0');\n</script>\n`;
    const out = adapter.getComponentInjector().inject(code);
    expect(out).toContain("import { t } from '@/plugins/locale'");
  });

  it('对照：注释里的 t( 仍不算真实调用，不注入（不回归）', () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const code =
      `<template>\n  <div>x</div>\n</template>\n` +
      `<script setup>\n// const msg = t('k0');\nconst a = 1;\n</script>\n`;
    const out = adapter.getComponentInjector().inject(code);
    expect(out).not.toContain("import { t } from '@/plugins/locale'");
  });
});

// ---------------------------------------------------------------------------
// #17 memo(forwardRef(...)) 双包裹：只解一层 → 组件识别失败 → 漏注入 hook
// ---------------------------------------------------------------------------
describe('React inject — memo(forwardRef(...)) 双包裹组件', () => {
  it('双包裹组件被识别为可注入组件并注入 hook', () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const code = `const X = memo(forwardRef((p, ref) => <div>{t('k0')}</div>));\n`;
    const out = adapter.getComponentInjector().inject(code);
    expect(out).toContain('useTranslation');
  });

  it('对照：单层 forwardRef 仍正常注入（不回归）', () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const code = `const Y = forwardRef((p, ref) => <div>{t('k0')}</div>);\n`;
    const out = adapter.getComponentInjector().inject(code);
    expect(out).toContain('useTranslation');
  });
});
