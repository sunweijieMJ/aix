import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectUsedKeys, stripCommentsForScan } from '../src/utils/source-key-scanner';
import { shouldReplaceNode } from '../src/utils/ast-core';
import { templateLiteralContainsHtmlTags } from '../src/utils/ast-guards';
import { decodeJsStringEscapes } from '../src/utils/string-escape';
import { FileUtils } from '../src/utils/file-utils';
import { LanguageFileManager } from '../src/utils/language-file-manager';
import { LoggerUtils } from '../src/utils/logger';
import { createFrameworkAdapter } from '../src/adapters';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import { VueAdapter } from '../src/adapters/VueAdapter';
import { resolveConfig, resolveBuckets } from '../src/config/loader';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';
import { writeTranslationsFile } from '../src/utils/json-io';

/**
 * 2026-08 全库审计确认的 P0 修复回归集。每个 describe 固定一个「会产出损坏代码 /
 * 静默丢数据」的已修缺陷，防止回潮。
 */

// cspell:ignore divt

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-p0-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const write = (rel: string, content: string): string => {
  const abs = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
};

// ---------------------------------------------------------------------------
// #1 stripComments 误吞 Vue 模板：裸 URL 的 `//`、不配对 `/*` 导致 key 漏采 → prune 误删
// ---------------------------------------------------------------------------
describe('stripCommentsForScan — .vue 模板段不得进 JS 词法状态机', () => {
  it('模板文本节点里的裸 URL 不吞掉行尾 t() 引用', () => {
    const out = stripCommentsForScan(
      'A.vue',
      `<template>\n  <div>详情见 https://example.com {{ t('page.detail') }}</div>\n</template>\n`,
    );
    expect(out).toContain("t('page.detail')");
  });

  it('模板文本节点里不配对的 /* 不吞掉文件剩余内容', () => {
    const out = stripCommentsForScan(
      'A.vue',
      `<template>\n  <div>glob 写法 src/* 示例</div>\n  <div>{{ t('after.glob') }}</div>\n</template>\n`,
    );
    expect(out).toContain("t('after.glob')");
  });

  it('script 段注释仍被剥除、HTML 注释仍被剥除', () => {
    const out = stripCommentsForScan(
      'A.vue',
      `<template>\n  <!-- {{ t('in.html.comment') }} -->\n  <div>{{ t('kept') }}</div>\n</template>\n` +
        `<script setup>\n// t('in.js.comment')\nconst x = t('js.kept');\n</script>\n`,
    );
    expect(out).toContain("t('kept')");
    expect(out).toContain("t('js.kept')");
    expect(out).not.toContain('in.html.comment');
    expect(out).not.toContain('in.js.comment');
  });

  it('畸形 SFC（parse 收集到 errors）→ 回退整文件扫描，script 段 key 不丢', () => {
    // @vue/compiler-sfc 的 parse 对语法错误不抛异常、只收集进 errors，且 descriptor
    // 可能缺段（未闭合的 </template 会让 script 块丢失）。必须显式回退，否则漏采 → 误删。
    const out = stripCommentsForScan(
      'Bad.vue',
      `<template><div>{{ t('x.y') }}</div></template\n<script>const a = t('z.key');</script>`,
    );
    expect(out).toContain("t('x.y')");
    expect(out).toContain("t('z.key')");
  });

  it('collectUsedKeys 端到端：模板含裸 URL 的 .vue，key 仍被采集（防 prune 误删）', () => {
    write(
      'src/App.vue',
      `<template>\n  <div>详情见 https://example.com {{ t('page.detail') }}</div>\n</template>\n`,
    );
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    const config = resolveConfig(user);
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('page.detail')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #2 Vue 文本节点 loc 校正：前导换行时 line 指向开标签行，从行首重试误改同行属性值
// ---------------------------------------------------------------------------
describe('Vue transform — 换行开头的文本节点不误改同行技术属性值', () => {
  it('value="全部" 与换行后的文本「全部」共存时，只替换文本节点', async () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const src = `<template>\n  <el-input value="全部">\n    全部\n  </el-input>\n</template>\n`;
    const fp = write('C.vue', src);
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(fp, strings, src);
    // 技术属性值必须原样保留（此前被误替换成非法的 value="{{ $t('k0') }}"）
    expect(out).toContain('value="全部"');
    // 真正的文本节点被替换
    expect(out).toContain("{{ $t('k0') }}");
  });
});

// ---------------------------------------------------------------------------
// #4 React 标签模板守卫：styled.div`…` 整段替换会拼成 styled.divt('key')
// ---------------------------------------------------------------------------
describe('React extract — 标签模板不提取', () => {
  it('styled.div 模板含中文 → 不提取（避免产出 styled.divt 未定义调用）', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    try {
      const fp = write('S.tsx', `const Box = styled.div\`\n  &::after { content: '必填'; }\n\`;\n`);
      const strings = await adapter.getTextExtractor().extractFromFile(fp);
      // 模板整体不被提取；插值内字符串字面量（'必填' 在 CSS 引号里，是模板字面段的一部分）也不提取
      expect(strings).toHaveLength(0);
      // 含中文时有告警留痕
      expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('标签模板'))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('标签模板 ${} 插值里的独立字符串字面量仍可提取（替换它不破坏 tag 调用）', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    // 中文字面量在插值表达式内：跳过模板本体后必须继续下钻子节点提取它
    const fp = write('S2.tsx', "const Box = styled.div`content: '${cond ? '已完成' : ''}';`;\n");
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    expect(strings.map((s) => s.original)).toContain('已完成');
  });
});

// ---------------------------------------------------------------------------
// #5 React 注入器：同名非 i18n 本地绑定（useTemperature 的 t）不得再注入 useTranslation
// ---------------------------------------------------------------------------
describe('React inject — 同名非 i18n 绑定冲突守卫', () => {
  it('const { t } = useTemperature() 的组件不注入（避免 TS2451 双声明）', () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    try {
      const code =
        `const ComponentB = () => {\n` +
        `  const { t } = useTemperature();\n` +
        `  return <div>{t(20)}</div>;\n` +
        `};\n`;
      const out = adapter.getComponentInjector().inject(code);
      expect(out).not.toContain('useTranslation');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('嵌套回调里的同名声明只是内层遮蔽，不算冲突（useEffect + setTimeout 常见形态）', () => {
    // TS2451 只发生在同一个块：内层块的 `const t` 与顶层注入的 hook 声明合法共存。
    // 守卫若误判会漏注入，组件级 t() 变成未定义（TS2304）——比要防的双声明更糟。
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const code =
      `const Comp = () => {\n` +
      `  useEffect(() => {\n` +
      `    const t = setTimeout(() => {}, 1000);\n` +
      `    return () => clearTimeout(t);\n` +
      `  }, []);\n` +
      `  return <div>{t('k0')}</div>;\n` +
      `};\n`;
    const out = adapter.getComponentInjector().inject(code);
    expect(out).toContain('useTranslation');
  });

  // 对照组（改前也通过）：证明守卫收窄后正常注入路径不回归
  it('对照：真缺 t 绑定的组件仍正常注入（不回归）', () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next', {});
    const code = `const ComponentA = () => {\n  return <div>{t('k0')}</div>;\n};\n`;
    const out = adapter.getComponentInjector().inject(code);
    expect(out).toContain('useTranslation');
  });
});

// ---------------------------------------------------------------------------
// #6 Restore：非对象字面量 values 保留原调用（不得字面化删变量）
// ---------------------------------------------------------------------------
describe('React restore — 非对象字面量 values 保留原调用/组件', () => {
  const lib = createReactI18nLibrary('react-i18next');
  const restore = (code: string, locale: Record<string, string>): string => {
    const file = write('R.tsx', code);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  it("t('greeting', opts)（标识符 values）→ 调用保留，变量不丢", () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  const opts = { name };\n` +
        `  return <div>{t('greeting', opts)}</div>;\n` +
        `}\n`,
      { greeting: '你好 {{name}}' },
    );
    expect(out).toContain("t('greeting', opts)");
    expect(out).not.toContain('你好 {name}');
  });

  it('<Trans values={sharedValues} />（标识符 values）→ 组件保留', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export const C = () => <Trans i18nKey="greeting" values={sharedValues} />;\n`,
      { greeting: '你好 {{name}}' },
    );
    expect(out).toContain('values={sharedValues}');
  });
});

// ---------------------------------------------------------------------------
// #7 Restore：带 children 的手写 <Trans> 整棵保留（富文本子树不可恢复删除）
// ---------------------------------------------------------------------------
describe('React restore — 带 children 的翻译组件保留', () => {
  const lib = createReactI18nLibrary('react-i18next');

  it('<Trans i18nKey>你好 <b>{name}</b></Trans> 不被整棵替换', () => {
    const file = write(
      'T.tsx',
      `import { Trans } from 'react-i18next';\n` +
        `export const C = () => (\n` +
        `  <div><Trans i18nKey="welcome">你好 <b>{name}</b></Trans></div>\n` +
        `);\n`,
    );
    const out = new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, {
      welcome: '你好 <1>{{name}}</1>',
    });
    expect(out).toContain('<b>{name}</b>');
    expect(out).toContain('<Trans');
  });
});

// ---------------------------------------------------------------------------
// #8 Restore：手写 exported HOC 解包时保留 export（模块公共 API 不得消失）
// ---------------------------------------------------------------------------
describe('React restore — 手写 HOC 解包保留 export', () => {
  it('export const InjectedFoo = injectIntl(Foo) → 解包为 export const InjectedFoo = Foo', () => {
    const lib = createReactI18nLibrary('react-intl');
    const file = write(
      'H.tsx',
      `import { injectIntl } from 'react-intl';\n` +
        `function Foo(props) {\n` +
        `  return <div>{props.intl.formatMessage({ id: 'k0' })}</div>;\n` +
        `}\n` +
        `export const InjectedFoo = injectIntl(Foo);\n`,
    );
    const out = new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, {
      k0: '你好',
    });
    // export 声明必须存活（此前整条语句被删，跨文件 import 编译失败）
    expect(out).toMatch(/export const InjectedFoo = /);
    expect(out).not.toContain('injectIntl(');
  });
});

// ---------------------------------------------------------------------------
// #9 转义解码统一：含转义反斜杠的字符串两侧归一后必须相等（防孤儿 key）
// ---------------------------------------------------------------------------
describe('shouldReplaceNode — 转义反斜杠归一', () => {
  it("源码 '目录：C:\\\\news' vs 提取的裸内容（单反斜杠+n）判相等", () => {
    const nodeText = "'目录：C:\\\\news'"; // 源码原样（含定界符与转义）
    const original = '目录：C:\\news'; // StringLiteral.text（已解码）
    expect(shouldReplaceNode(nodeText, original, { originalDelimited: false })).toBe(true);
  });

  it('裸内容侧不再被二次解码（字面 \\n 与真实换行不得误判相等）', () => {
    // 非对称场景钉契约：旧实现对两侧都跑 decodeEscapes，「字面反斜杠+n」会被解码成换行、
    // 与「真实换行」误判相等（错误命中 → 替换到错误节点）。新契约下裸内容侧不解码，
    // 两者必须不相等。
    expect(
      shouldReplaceNode('路径 C:\\new', '路径 C:\new', {
        nodeDelimited: false,
        originalDelimited: false,
      }),
    ).toBe(false);
  });

  it('decodeJsStringEscapes 覆盖 \\\\ 与 \\`', () => {
    expect(decodeJsStringEscapes('C:\\\\news')).toBe('C:\\news');
    expect(decodeJsStringEscapes('a\\`b\\`c')).toBe('a`b`c');
  });
});

// ---------------------------------------------------------------------------
// #10 桶名 'index' 保留 + 重复导出不再把 index.json 当孤儿桶
// ---------------------------------------------------------------------------
describe('buckets — index.json 命名空间隔离', () => {
  it("桶名 'index' 被 loader 拒绝", () => {
    expect(() => resolveBuckets({ rules: [{ name: 'index', match: 'src/**' }] })).toThrow(
      /保留名 "index"/,
    );
  });

  it("defaultBucket 'index' 被 loader 拒绝", () => {
    expect(() =>
      resolveBuckets({ rules: [{ name: 'a', match: 'src/**' }], defaultBucket: 'index' }),
    ).toThrow(/保留名 "index"/);
  });

  it('重复写入桶文件时，已存在的 index.json 不被改名 .bak', () => {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      buckets: { rules: [{ name: 'views', match: 'src/views/**' }] },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    const config: ResolvedConfig = resolveConfig(user);
    const messages = { 'views.a': '甲' };
    const keyBucketMap = { 'views.a': 'views' };
    new LanguageFileManager(config, false).writeLocaleFile(messages, 'zh-CN', keyBucketMap);
    // 模拟导出器随后生成的桶清单
    const indexPath = path.join(tmpDir, 'locale', 'zh-CN', 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({ buckets: ['views'] }));
    // 第二次写入：index.json 不得被当孤儿桶备份
    new LanguageFileManager(config, false).writeLocaleFile(messages, 'zh-CN', keyBucketMap);
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(`${indexPath}.bak`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #12 HTML 标签判据：`< 标识符 `（不等式）不再误判为 HTML
// ---------------------------------------------------------------------------
describe('templateLiteralContainsHtmlTags — 不等式不误判', () => {
  it('`当前值 < min 时` 不算 HTML', () => {
    expect(templateLiteralContainsHtmlTags('当前值 ${a} < min 时请调整')).toBe(false);
  });
  it('真实标签仍命中', () => {
    expect(templateLiteralContainsHtmlTags('<div>中文</div>')).toBe(true);
    expect(templateLiteralContainsHtmlTags('文本 <br/> 换行')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 附：Vue 邻行 fallback 的比较操作数守卫（S2）
// ---------------------------------------------------------------------------
describe('Vue transform — 跨行插值 fallback 不替换比较操作数', () => {
  it("status === '进行中' 的操作数保留，展示分支被替换", async () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const src = `<template>\n  <div>{{\n    status === '进行中' ? '进行中' : '已完成'\n  }}</div>\n</template>\n`;
    const fp = write('S.vue', src);
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(fp, strings, src);
    // 比较操作数必须原样保留（不得被替换成 $t 导致分支永不命中）
    expect(out).toMatch(/status === '进行中'/);
  });
});

// ---------------------------------------------------------------------------
// #11 CSV 行宽守卫 + 导出侧非对象条目守卫
// ---------------------------------------------------------------------------
describe('CsvImport/CsvExport — 行宽与条目形态守卫', () => {
  const makeConfig = (): ResolvedConfig => {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US', 'ja-JP'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  };

  it('字段数与表头不符的行整行跳过（错位译文不得写入），合法行照常回流；空行不告警', async () => {
    const config = makeConfig();
    const untranslatedPath = FileUtils.getUntranslatedPath(config, false);
    fs.mkdirSync(path.dirname(untranslatedPath), { recursive: true });
    writeTranslationsFile(untranslatedPath, {
      'k.good': { 'zh-CN': '好', 'en-US': '', 'ja-JP': '' },
      'k.bad': { 'zh-CN': '坏', 'en-US': '', 'ja-JP': '' },
    });
    fs.writeFileSync(path.join(tmpDir, 'locale', 'translations.json'), '{}');
    // k.bad 行少一个字段（模拟误删逗号后列整体左移：日文出现在 en-US 位）
    const csvPath = path.join(tmpDir, 'in.csv');
    fs.writeFileSync(
      csvPath,
      ['key,zh-CN,en-US,ja-JP', 'k.good,好,good,グッド', 'k.bad,坏悪い,bad', ''].join('\n'),
    );
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    try {
      const { CsvImportProcessor } = await import('../src/core/CsvImportProcessor');
      await new CsvImportProcessor(config, false, {
        input: csvPath,
        dryRun: false,
        ci: true,
      }).execute();
      const after = JSON.parse(fs.readFileSync(untranslatedPath, 'utf-8'));
      // 合法行照常写回
      expect(after['k.good']['en-US']).toBe('good');
      expect(after['k.good']['ja-JP']).toBe('グッド');
      // 错位行整行跳过：任何列都不得被污染
      expect(after['k.bad']['en-US']).toBe('');
      expect(after['k.bad']['ja-JP']).toBe('');
      // 有告警且不把结尾空行算进去（恰 1 条记录）
      const warnText = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(warnText).toMatch(/已跳过字段数与表头不符的记录 1 条/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('csv-export：null/非对象条目跳过并告警，不再 TypeError 崩溃', async () => {
    const config = makeConfig();
    const untranslatedPath = FileUtils.getUntranslatedPath(config, false);
    fs.mkdirSync(path.dirname(untranslatedPath), { recursive: true });
    fs.writeFileSync(
      untranslatedPath,
      JSON.stringify({ 'k.ok': { 'zh-CN': '好', 'en-US': '' }, 'k.null': null }),
    );
    const outPath = path.join(tmpDir, 'out.csv');
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    try {
      const { CsvExportProcessor } = await import('../src/core/CsvExportProcessor');
      await new CsvExportProcessor(config, false, {
        source: 'untranslated',
        filter: 'all',
        langs: ['en-US'],
        output: outPath,
      }).execute();
      const csv = fs.readFileSync(outPath, 'utf-8');
      expect(csv).toContain('k.ok');
      expect(csv).not.toContain('k.null');
      expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('k.null'))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// getToolVersion：源码直跑（ESM）下必须能读到本包版本（此前裸 require 恒 undefined）
// ---------------------------------------------------------------------------
describe('GenerateProcessor.getToolVersion — ESM 源码路径可用', () => {
  it('返回 @kit/i18n-tools 自身的 version', async () => {
    const { GenerateProcessor } = await import('../src/core/GenerateProcessor');
    const version = (
      GenerateProcessor as unknown as { getToolVersion(): string | undefined }
    ).getToolVersion();
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
    ) as { version: string };
    expect(version).toBe(pkg.version);
  });
});
