import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  collectUsedKeys,
  createKeyNormalizer,
  scanKeyReferencesInContent,
  stripCommentsForScan,
} from '../src/utils/source-key-scanner';
import { createFrameworkAdapter } from '../src/adapters';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig } from '../src/config';

/**
 * collectUsedKeys 必须识别所有 i18n key 引用形式（不止 t()/$t() 函数调用），
 * 否则 doctor 误报 orphan、prune 误删（如 vue-i18n 的 <i18n-t keypath>）。
 */
describe('collectUsedKeys — 全形式识别', () => {
  let root: string;
  let srcDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
    srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function makeConfig(framework: I18nToolsConfig['framework']) {
    const user: I18nToolsConfig = {
      root,
      framework,
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  }
  function write(rel: string, content: string) {
    const abs = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  it('Vue：t() / $t() / <i18n-t keypath> / v-t 都识别', () => {
    write(
      'App.vue',
      [
        '<template>',
        `  <div>{{ t('a.func') }}</div>`,
        `  <div>{{ $t('a.dollar') }}</div>`,
        `  <i18n-t keypath="a.keypath" tag="span"></i18n-t>`,
        `  <span v-t="'a.directive'"></span>`,
        `  <div id="not-a-key">普通 HTML id 不应被当成 key</div>`,
        '</template>',
      ].join('\n'),
    );
    const config = makeConfig({ type: 'vue', library: 'vue-i18n', tImport: '@/i18n' });
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('a.func')).toBe(true);
    expect(used.has('a.dollar')).toBe(true);
    expect(used.has('a.keypath')).toBe(true);
    expect(used.has('a.directive')).toBe(true);
    expect(used.has('not-a-key')).toBe(false); // 普通 id 不误吃
  });

  it('t() 首参为三元表达式：两个分支 key 都识别；插值值不误吃', () => {
    write(
      'B.vue',
      [
        '<script setup>',
        `const m = t(cond ? 'a.yes' : 'a.no');`, // 三元两分支
        `const g = t('a.greet', { name: 'John' });`, // 插值值 John 不是 key
        '</script>',
      ].join('\n'),
    );
    const config = makeConfig({ type: 'vue', library: 'vue-i18n', tImport: '@/i18n' });
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('a.yes')).toBe(true);
    expect(used.has('a.no')).toBe(true);
    expect(used.has('a.greet')).toBe(true);
    expect(used.has('John')).toBe(false); // 第二实参的插值值不当 key
  });

  // 回归（审计 Bug #4）：key 字面量自身含逗号/右括号时，首参不得在字符串内部提前截断，
  // 否则 key 漏采 → prune/doctor 误判孤儿并从所有 locale 永久删除（破坏性）。
  describe('scanKeyReferencesInContent — key 含逗号/右括号不漏采', () => {
    it("含逗号的 key t('已完成, 待处理') 被完整识别", () => {
      expect(scanKeyReferencesInContent(`const m = t('已完成, 待处理');`)).toContain(
        '已完成, 待处理',
      );
    });

    it("含右括号的 key t('点击(此处)') 被完整识别", () => {
      expect(scanKeyReferencesInContent(`const m = t('点击(此处)');`)).toContain('点击(此处)');
    });

    it('双引号包裹同样不被内部逗号/括号截断', () => {
      const refs = scanKeyReferencesInContent(`const m = t("a, b)c");`);
      expect(refs).toContain('a, b)c');
    });

    it('回归保护：第二实参选项对象的值仍不被当 key（逗号边界判定不破坏）', () => {
      const refs = scanKeyReferencesInContent(`t('a.greet', { name: 'John' });`);
      expect(refs).toContain('a.greet');
      expect(refs).not.toContain('John');
    });

    it('回归保护：三元两分支仍都识别', () => {
      const refs = scanKeyReferencesInContent(`t(cond ? 'a.yes' : 'a.no');`);
      expect(refs).toContain('a.yes');
      expect(refs).toContain('a.no');
    });
  });

  // 回归（审计：引号需配对）：STRING_LITERAL 此前 /['"]([^'"]+)['"]/ 不校验开闭引号同型，
  // 双引号串含撇号（英文极常见，如 "Don't"）或单引号串含双引号会在内引号处截断 →
  // key 漏采，进而被 prune/doctor 当孤儿从所有 locale 永久删除（破坏性）。
  describe('scanKeyReferencesInContent — 引号需配对，含内引号的 key 不截断', () => {
    it('双引号 key 含撇号 t("Don\'t") 完整识别（不截成 Don）', () => {
      const refs = scanKeyReferencesInContent(`const m = t("Don't");`);
      expect(refs).toContain("Don't");
      expect(refs).not.toContain('Don');
    });

    it("单引号 key 含双引号 t('a\"b') 完整识别（不截成 a）", () => {
      const refs = scanKeyReferencesInContent(`const m = t('a"b');`);
      expect(refs).toContain('a"b');
      expect(refs).not.toContain('a');
    });
  });

  describe('scanKeyReferencesInContent — JavaScript 字符串转义', () => {
    it('单引号 key 中的转义单引号被完整识别并解码', () => {
      const refs = scanKeyReferencesInContent(String.raw`const m = t('don\'t.key');`);
      expect(refs).toContain("don't.key");
    });

    it('双引号 key 中的转义双引号被完整识别并解码', () => {
      const refs = scanKeyReferencesInContent(String.raw`const m = t("say\"hi.key");`);
      expect(refs).toContain('say"hi.key');
    });

    it('key 中的转义反斜杠还原为单个反斜杠', () => {
      const refs = scanKeyReferencesInContent(String.raw`const m = t('path\\key');`);
      expect(refs).toContain('path\\key');
    });
  });

  it('react-i18next：t() / <Trans i18nKey> 都识别', () => {
    write(
      'App.tsx',
      [`const a = t('r.func');`, `const el = <Trans i18nKey="r.trans" />;`].join('\n'),
    );
    const config = makeConfig({ type: 'react', library: 'react-i18next', tImport: '@/i18n' });
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('r.func')).toBe(true);
    expect(used.has('r.trans')).toBe(true);
  });

  it('react-intl：formatMessage({id}) / <FormattedMessage id> 识别，普通 id 不误吃', () => {
    write(
      'App.tsx',
      [
        `intl.formatMessage({ id: 'r.format', defaultMessage: 'x' });`,
        `const el = <FormattedMessage id="r.fmt" defaultMessage="y" />;`,
        `const div = <div id="plain-id" />;`,
        `const obj = { id: 'not-i18n' };`,
      ].join('\n'),
    );
    const config = makeConfig({ type: 'react', library: 'react-intl', tImport: '@/i18n' });
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('r.format')).toBe(true);
    expect(used.has('r.fmt')).toBe(true);
    expect(used.has('plain-id')).toBe(false); // 普通 JSX id 不误吃
    expect(used.has('not-i18n')).toBe(false); // 普通对象 id 不误吃
  });
});

/**
 * 回归：.tsx/.jsx/.js 的 JSX 文本节点是正文、不在引号内，整文件交给 JS 词法状态机
 * （stripComments）会把文本里的 `//`（典型：裸 URL）当行注释，吞掉同行的 t() 调用 →
 * key 漏采 → prune/doctor 把在用 key 当孤儿从所有 locale 永久删除。
 * 与 .vue 模板段是同构问题，故 JS/TS 系改由 TypeScript 解析器按 AST token 前导 trivia 精确剥离。
 */
describe('stripCommentsForScan — JSX 正文不得被当注释吞掉', () => {
  const keysOf = (file: string, code: string): string[] =>
    scanKeyReferencesInContent(stripCommentsForScan(file, code));

  it('JSX 文本里的裸 URL 不吞掉同行 t()', () => {
    const code = `export const P = () => <p>详情见 https://example.com 查看 {t('page.detail.link')}</p>;`;
    expect(keysOf('P.tsx', code)).toContain('page.detail.link');
  });

  it('JSX 文本以 // 开头（非注释）时同行 t() 仍被采到', () => {
    const code = [
      'export const C = () => (',
      '  <p>',
      '    // 这是正文不是注释',
      "    {t('jsx.text.key')}",
      '  </p>',
      ');',
    ].join('\n');
    expect(keysOf('C.tsx', code)).toContain('jsx.text.key');
  });

  it('.jsx / .js 同样走 AST 剥离（React 项目常见扩展名）', () => {
    const jsx = `export const A = () => <p>见 https://a.com {t('a.key')}</p>;`;
    expect(keysOf('A.jsx', jsx)).toContain('a.key');
    expect(keysOf('A.js', jsx)).toContain('a.key');
  });

  it('行注释 / 块注释 / 行尾注释里的 t() 仍被剥掉', () => {
    const code = [
      "// const a = t('comment.line');",
      "/* const b = t('comment.block'); */",
      "export const c = t('real.key'); // t('comment.trailing')",
    ].join('\n');
    const keys = keysOf('C.tsx', code);
    expect(keys).toEqual(['real.key']);
  });

  it('JSX 表达式容器内的注释 {/* t() */} 被剥掉', () => {
    const code = `export const H = () => <p>{/* t('jsx.comment') */}{t('h.key')}</p>;`;
    const keys = keysOf('H.tsx', code);
    expect(keys).toContain('h.key');
    expect(keys).not.toContain('jsx.comment');
  });

  it('字符串字面量 / JSX 属性里的 // 不误伤同行 t()', () => {
    const code = [
      `const url = 'https://example.com';`,
      `export const D = () => <a href="http://x">{t('d.key')}</a>;`,
    ].join('\n');
    expect(keysOf('D.tsx', code)).toContain('d.key');
  });

  it('剥离后长度与原文逐字符对齐（偏移不漂移）', () => {
    const code = [
      "// t('x')",
      "export const E = () => <p>a // b {t('e.key')}</p>; /* t('y') */",
    ].join('\n');
    expect(stripCommentsForScan('E.tsx', code)).toHaveLength(code.length);
  });

  it('语法错误无法解析时兜底走「多算不误删」：正文 t() 仍被采到', () => {
    // TS 解析器对语法错误不抛异常而是就地恢复，恢复出的树可能把 JSX 正文错当代码。
    // 此时宁可整文不剥注释（注释里的引用多算 = 不删），也不能吞正文（少算 = 误删）。
    const code = `export const E = () => <p>{t('broken.key')}</p>;\nconst x = ;`;
    expect(keysOf('E.tsx', code)).toContain('broken.key');
  });

  it('.ts 无 JSX 正文，注释照常剥离', () => {
    const code = ["// t('ts.comment')", "export const f = () => t('ts.key');"].join('\n');
    expect(keysOf('F.ts', code)).toEqual(['ts.key']);
  });
});

/** 端到端：裸 URL 的 .tsx 文件不得让 collectUsedKeys 漏采（prune 据此判孤儿）。 */
describe('collectUsedKeys — JSX 裸 URL 文件', () => {
  let root: string;
  let srcDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-jsx-'));
    srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('裸 URL 同行的 t() 进入 used 集合，注释中的 t() 不进', () => {
    fs.writeFileSync(
      path.join(srcDir, 'Detail.tsx'),
      [
        "// const dead = t('dead.key');",
        'export const Detail = () => (',
        "  <p>详情见 https://example.com 查看 {t('page.detail.link')}</p>",
        ');',
      ].join('\n'),
    );
    const user: I18nToolsConfig = {
      root,
      framework: { type: 'react', library: 'react-i18next', tImport: '@/i18n' },
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    const config = resolveConfig(user);
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('page.detail.link')).toBe(true);
    expect(used.has('dead.key')).toBe(false);
  });
});

/**
 * 回归（四轮审计 A1）：createKeyNormalizer 是 doctor/prune 与 restore 的同一套 namespace
 * 口径。i18next 系（library.supportsNamespace）一律剥首个冒号前缀（与
 * VueRestoreTransformer.lookupText 一致）；其余库只剥恰为 framework.namespace 的前缀。
 */
describe('createKeyNormalizer — namespace 归一口径', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-ns-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const normalizerFor = (framework: I18nToolsConfig['framework']): ((key: string) => string) => {
    const config = resolveConfig({
      root,
      framework,
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    });
    return createKeyNormalizer(config, createFrameworkAdapter(config));
  };

  it('vue-i18next：未配 namespace 也剥首个冒号前缀', () => {
    const normalize = normalizerFor({ type: 'vue', library: 'vue-i18next', tImport: '@/i18n' });
    expect(normalize('app:greeting')).toBe('greeting');
    expect(normalize('greeting')).toBe('greeting');
    // 只剥首个冒号，其余原样保留
    expect(normalize('app:a:b')).toBe('a:b');
  });

  it('vue-i18n：不剥冒号；配了 namespace 时只剥恰为该前缀的部分', () => {
    const plain = normalizerFor({ type: 'vue', library: 'vue-i18n', tImport: '@/i18n' });
    expect(plain('app:greeting')).toBe('app:greeting');

    const withNs = normalizerFor({
      type: 'vue',
      library: 'vue-i18n',
      tImport: '@/i18n',
      namespace: 'app',
    });
    expect(withNs('app:greeting')).toBe('greeting');
    expect(withNs('other:greeting')).toBe('other:greeting');
  });

  it('collectUsedKeys 按同一口径归一（vue-i18next 下源码 ns:key → 裸 key）', () => {
    fs.writeFileSync(
      path.join(root, 'src', 'A.vue'),
      `<template><div>{{ $t('app:greeting') }}</div></template>`,
    );
    const config = resolveConfig({
      root,
      framework: { type: 'vue', library: 'vue-i18next', tImport: '@/i18n' },
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    });
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('greeting')).toBe(true);
    expect(used.has('app:greeting')).toBe(false);
  });
});

/**
 * 顶层把 `t` 绑定到非 i18n 来源（本地模板函数）时，该文件的裸 `t(...)` 首参不是 i18n key。
 *
 * 两个方向都必须守住：
 *  - missing-key 检查（skipNonI18nTranslationCalls: true）跳过这些引用，否则 doctor 误红；
 *  - prune / orphan-key 用的默认口径**不得**因此缩小 —— usedKeys 少算一个在用 key，
 *    就等于把它从所有 locale 永久删除。
 */
describe('collectUsedKeys — 顶层非 i18n t 绑定', () => {
  let root: string;
  let srcDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-conflict-t-'));
    srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const buildConfig = () =>
    resolveConfig({
      root,
      framework: { type: 'react', library: 'react-i18next', tImport: '@/plugins/locale' },
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  const writeFixture = (): void => {
    fs.writeFileSync(
      path.join(srcDir, 'Local.tsx'),
      `import { t } from './tiny-template';
export function Local({ name }: { name: string }) {
  return <div>{t('你好 {name}', { name })}</div>;
}
`,
    );
    // 同目录另一个文件走工具注入的 tImport，其 t() 引用属于真 key，两侧口径都要采到
    fs.writeFileSync(
      path.join(srcDir, 'Real.tsx'),
      `import { t } from '@/plugins/locale';
export function Real() {
  return <div>{t('views.real.title')}</div>;
}
`,
    );
  };

  it('默认口径（prune / orphan-key）不缩小：本地 t() 的首参照旧计入 usedKeys', () => {
    writeFixture();
    const config = buildConfig();
    const used = collectUsedKeys(config, createFrameworkAdapter(config));
    expect(used.has('你好 {name}')).toBe(true);
    expect(used.has('views.real.title')).toBe(true);
  });

  it('missing-key 口径：跳过该文件的裸 t()，tImport 文件的引用照常保留', () => {
    writeFixture();
    const config = buildConfig();
    const used = collectUsedKeys(config, createFrameworkAdapter(config), {
      skipNonI18nTranslationCalls: true,
    });
    expect(used.has('你好 {name}')).toBe(false);
    expect(used.has('views.real.title')).toBe(true);
  });

  it('missing-key 口径：同文件的 <Trans i18nKey> 不受影响（名字与 t 无关）', () => {
    fs.writeFileSync(
      path.join(srcDir, 'Mixed.tsx'),
      `import { t } from './tiny-template';
import { Trans } from 'react-i18next';
export function Mixed() {
  return <p title={t('模板 {x}', { x: '1' })}><Trans i18nKey="views.mixed.body" /></p>;
}
`,
    );
    const config = buildConfig();
    const used = collectUsedKeys(config, createFrameworkAdapter(config), {
      skipNonI18nTranslationCalls: true,
    });
    expect(used.has('views.mixed.body')).toBe(true);
    expect(used.has('模板 {x}')).toBe(false);
  });
});

/**
 * 静态 key 的引用形态覆盖面：任一形态漏采都会让该 key 被 doctor 报孤儿、
 * 被 prune 从所有 locale 永久删除（破坏性）。
 */
describe('scanKeyReferencesInContent — 静态引用形态补全', () => {
  const keys = (code: string): string[] => scanKeyReferencesInContent(code);

  it('B1: 无插值的反引号 key 被采集', () => {
    expect(keys('t(`views.a.sub`)')).toEqual(['views.a.sub']);
    expect(keys('$t(`views.a.title`)')).toEqual(['views.a.title']);
  });

  it('B1: 含插值的反引号仍按动态处理（交给 dynamicKeyAllowlist）', () => {
    expect(keys('t(`views.${name}.title`)')).toEqual([]);
    expect(keys("t(cond ? `a.${x}` : 'b')")).toEqual(['b']);
  });

  it('U-05: v-t 的对象形态与内外引号互换都识别', () => {
    expect(keys(`<p v-t="{ path: 'home.title' }"></p>`)).toEqual(['home.title']);
    expect(keys(`<p v-t='"home.title"'></p>`)).toEqual(['home.title']);
    expect(keys(`<p v-t="'home.title'"></p>`)).toEqual(['home.title']);
  });

  it('U-05: v-t 的动态 path 不产出假 key', () => {
    expect(keys(`<p v-t="{ path: dynamicKey }"></p>`)).toEqual([]);
  });

  it('U-05: 绑定字面量 :keypath 与 JSX 表达式容器形态都识别', () => {
    expect(keys(`<i18n-t :keypath="'home.title'" />`)).toEqual(['home.title']);
    expect(keys(`<Trans i18nKey={'home.title'} />`)).toEqual(['home.title']);
    expect(keys('<Trans i18nKey={`home.title`} />')).toEqual(['home.title']);
  });

  it('U-05: id 定位允许属性 / 选项对象里出现成对花括号', () => {
    expect(keys(`<FormattedMessage values={{ n: a > 1 }} id="app.hello" />`)).toEqual([
      'app.hello',
    ]);
    expect(keys(`<FormattedMessage id={'app.hello'} />`)).toEqual(['app.hello']);
    expect(keys(`intl.formatMessage({ values: { n: 1 }, id: 'app.hello' })`)).toEqual([
      'app.hello',
    ]);
  });

  it('U-06: defineMessages 定义块里的所有 id 都被采集', () => {
    const code = `const messages = defineMessages({
  hello: { id: 'app.hello', defaultMessage: '你好' },
  bye: { id: 'app.bye', defaultMessage: '再见' },
});
const s = intl.formatMessage(messages.hello);`;
    expect(keys(code).sort()).toEqual(['app.bye', 'app.hello']);
  });

  it('U-06: defineMessages 之外的普通对象 id 不被误采', () => {
    expect(keys(`const el = { id: 'dom-node-id', label: '标签' };`)).toEqual([]);
  });
});

/**
 * .vue 的 tsx/jsx script 块正文含 JSX 文本节点，词法状态机会把裸 URL 的 `//`、
 * 不配对的 `/*` 当注释吞掉后续 t() 调用 → key 漏采 → prune 误删。
 */
describe('stripCommentsForScan — .vue 的 tsx/jsx 块按 AST 剥注释', () => {
  const scan = (code: string): string[] =>
    scanKeyReferencesInContent(stripCommentsForScan('Comp.vue', code));

  it('U-02: lang="tsx" 块里裸 URL 同行的 t() 不被吞掉', () => {
    const code = `<script lang="tsx">
export default () => <p>详情见 https://a.com {t('k.in.tsx')}</p>;
</script>`;
    expect(scan(code)).toEqual(['k.in.tsx']);
  });

  it('U-02: lang="jsx" 块里正文的 /* 字样不吞掉后续 key', () => {
    const code = `<script lang="jsx">
export default () => <p>忽略 src/* 目录 {t('k1')} 与 {t('k2')}</p>;
</script>`;
    expect(scan(code)).toEqual(['k1', 'k2']);
  });

  it('U-02: lang="tsx" 块里的真注释仍被剥掉', () => {
    const code = `<script lang="tsx">
// t('dead.key')
export default () => <p>{t('live.key')}</p>;
</script>`;
    expect(scan(code)).toEqual(['live.key']);
  });

  it('U-02: 普通 lang="ts" 块口径不变', () => {
    const code = `<script lang="ts">
// t('dead.key')
export default { created() { t('live.key'); } };
</script>`;
    expect(scan(code)).toEqual(['live.key']);
  });
});

/**
 * hasNonI18nTranslationBinding 判「非 i18n 绑定」会让整个文件的裸 t() 退出 missing-key
 * 对账；vue-i18n 组件外用法与 hook 解构是 i18n 来源，不能算本地模板函数。
 */
describe('collectUsedKeys — i18n 来源的顶层 t 绑定仍参与 missing-key', () => {
  let root: string;
  let srcDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-i18n-binding-'));
    srcDir = path.join(root, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const buildConfig = () =>
    resolveConfig({
      root,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/plugins/locale' },
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  const usedWithSkip = (fileName: string, content: string): Set<string> => {
    fs.writeFileSync(path.join(srcDir, fileName), content);
    const config = buildConfig();
    return collectUsedKeys(config, createFrameworkAdapter(config), {
      skipNonI18nTranslationCalls: true,
    });
  };

  it('B7: const { t } = i18n.global 的裸 t() 仍计入', () => {
    const used = usedWithSkip(
      'store.ts',
      `import i18n from '@/i18n';\nconst { t } = i18n.global;\nexport const title = t('store.title');\n`,
    );
    expect(used.has('store.title')).toBe(true);
  });

  it('B7: const t = i18n.global.t 的裸 t() 仍计入', () => {
    const used = usedWithSkip(
      'util.ts',
      `import i18n from '@/i18n';\nconst t = i18n.global.t;\nexport const title = t('util.title');\n`,
    );
    expect(used.has('util.title')).toBe(true);
  });

  it('B7: 顶层 const { t } = useI18n() 的裸 t() 仍计入', () => {
    const used = usedWithSkip(
      'composable.ts',
      `import { useI18n } from 'vue-i18n';\nconst { t } = useI18n();\nexport const title = t('composable.title');\n`,
    );
    expect(used.has('composable.title')).toBe(true);
  });

  it('B7: 真正的本地模板函数 t 仍被跳过', () => {
    const used = usedWithSkip(
      'local.ts',
      `import { format } from './tiny-template';\nconst t = format;\nexport const s = t('你好 {name}', { name: 'x' });\n`,
    );
    expect(used.has('你好 {name}')).toBe(false);
  });
});
