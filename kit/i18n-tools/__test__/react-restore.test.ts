import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as ts from 'typescript';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { HooksUtils } from '../src/strategies/react/hooks-utils';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import type { ReactI18nLibraryType } from '../src/strategies/react/libraries';
import { LoggerUtils } from '../src/utils/logger';
import type { ExtractedString } from '../src/utils/types';

/**
 * React「还原(restore)」边界用例合集。
 *
 * 各 describe 块保留各自的临时目录、restore 辅助函数（tImport 路径 / 文件名各异）与断言，
 * 不互相耦合。
 */

/**
 * Bug B3：react-intl 类组件经 injectIntl HOC 注入后，restore 必须可逆。
 *
 * inject 端把 `export class Greeting` 改写为：
 *   class GreetingWithOutIntl extends React.Component<WrappedComponentProps> {...}
 *   export const Greeting = injectIntl(GreetingWithOutIntl);
 *
 * 缺陷：restore 端 unwrapHOC 的类名还原只认下划线前缀 `_Comp`，不认 `WithOutIntl` 后缀，
 * 导致还原后类名停留在 GreetingWithOutIntl、且 export 整条丢失 → 模块对外 API 断裂。
 */
describe('React restore — 类组件 injectIntl HOC 可逆（Bug B3）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-class-hoc-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /**
   * inject（react-intl）→ 收集 locale → restore，返回还原后的源码。
   * omitKeys：从 locale 中剔除的 key，用于模拟「locale 缺 key」的不完整还原。
   */
  async function roundTrip(
    original: string,
    omitKeys: string[] = [],
  ): Promise<{ injected: string; restored: string }> {
    const file = path.join(dir, 'G.tsx');
    fs.writeFileSync(file, original);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-intl');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s: ExtractedString, i) => (s.semanticId = `k${i}`));
    const injected = adapter.getTransformer().transform(file, strings, original);
    const locale: Record<string, string> = {};
    strings.forEach((s) => {
      if (omitKeys.includes(s.semanticId)) return;
      locale[s.semanticId] = s.processedMessage || s.original;
    });

    fs.writeFileSync(file, injected);
    const lib = createReactI18nLibrary('react-intl');
    const restored = new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
    return { injected, restored };
  }

  it('导出的类组件：还原后类名复原 + export 保留 + HOC 移除', async () => {
    const original = `import React from 'react';
export class Greeting extends React.Component {
  render() {
    return <div title="你好">x</div>;
  }
}
`;
    const { injected, restored } = await roundTrip(original);

    // 前置确认：inject 确实走了 HOC 路径（否则测不到 B3）
    expect(injected).toContain('GreetingWithOutIntl');
    expect(injected).toContain('injectIntl(GreetingWithOutIntl)');

    // 还原后：类名复原为 Greeting，不残留 WithOutIntl
    expect(restored, `还原输出：\n${restored}`).toMatch(/class\s+Greeting\b/);
    expect(restored).not.toContain('WithOutIntl');
    // export 必须保留（模块对外 API 不丢）
    expect(restored).toMatch(/export\s+class\s+Greeting\b/);
    // HOC 包裹语句必须移除
    expect(restored).not.toContain('injectIntl');
    // 文案还原
    expect(restored).toContain('你好');
  });

  it('未导出的类组件：还原后不应凭空加 export', async () => {
    const original = `import React from 'react';
class Panel extends React.Component {
  render() {
    return <div title="设置">x</div>;
  }
}
export default Panel;
`;
    const { injected, restored } = await roundTrip(original);
    expect(injected).toContain('PanelWithOutIntl');

    expect(restored).toMatch(/class\s+Panel\b/);
    expect(restored).not.toContain('WithOutIntl');
    // 原类本身没有 export 前缀，还原后也不应有 `export class Panel`
    expect(restored).not.toMatch(/export\s+class\s+Panel\b/);
    expect(restored).toContain('设置');
  });

  it('默认导出的类组件：inject 不遗留孤立 default + restore 恢复 export default class（Bug #1）', async () => {
    const original = `import React from 'react';
export default class Foo extends React.Component {
  render() {
    return <div title="确定">x</div>;
  }
}
`;
    const { injected, restored } = await roundTrip(original);

    // inject 端：走 HOC 路径，且不得遗留孤立的 `default class`（语法错误）
    expect(injected).toContain('FooWithOutIntl');
    expect(injected).toMatch(/export default injectIntl\(FooWithOutIntl\)/);
    expect(injected, `inject 输出：\n${injected}`).not.toMatch(/default\s+class/);

    // restore 端：恢复 `export default class Foo`，不残留内部名 / HOC / 旧引用
    expect(restored, `还原输出：\n${restored}`).toMatch(/export\s+default\s+class\s+Foo\b/);
    expect(restored).not.toContain('WithOutIntl');
    expect(restored).not.toContain('injectIntl');
    // 默认导出唯一，不得出现重复 export default
    expect((restored.match(/export\s+default/g) || []).length).toBe(1);
    expect(restored).toContain('确定');
  });

  it('localeMap 不完整：存活的 this.props.intl 调用必须保留 HOC 包裹与 WrappedComponentProps（#1）', async () => {
    // 两个可翻译文案 → k0/k1；还原时丢弃其一 → 对应 intl.formatMessage 无法还原而存活。
    // 该存活调用读 this.props.intl，依赖 injectIntl HOC 注入的 intl 与 WrappedComponentProps 类型。
    const original = `import React from 'react';
export class Greeting extends React.Component {
  render() {
    return <div title="你好" aria-label="再见">x</div>;
  }
}
`;
    const { injected, restored } = await roundTrip(original, ['k1']);

    // 前置确认：inject 走 HOC 路径并注入了 props 类型
    expect(injected).toContain('injectIntl(GreetingWithOutIntl)');
    expect(injected).toContain('WrappedComponentProps');

    // 存活的翻译调用仍在（依赖 this.props.intl）
    expect(restored, `还原输出：\n${restored}`).toContain('intl.formatMessage');
    // 修复点：unwrapHOC / cleanupHOCPropsType 受存活守卫门控，HOC 包裹与 props 类型必须保留，
    // 否则 this.props.intl 运行时 undefined + props 被剥成 {} 的 TS 报错（守卫本要防的破坏）。
    expect(restored).toContain('injectIntl(GreetingWithOutIntl)');
    expect(restored).toContain('WrappedComponentProps');
    // 可还原的那一条仍被还原为中文（k0/k1 提取顺序无关，至少有一条恢复）
    expect(restored).toMatch(/你好|再见/);
  });
});

/**
 * 回归（medium×2）：restore 清理 hook 依赖数组必须与 generate 注入对称。
 *
 * 根因（修复前）：
 *  - #5 generate 端把 t 注入 useLayoutEffect 依赖，restore 端白名单漏了 useLayoutEffect；
 *  - #6 generate 端识别 React.useXxx 成员调用，restore 端遇非裸 Identifier 直接 bail。
 * 两种情况 restore 都删掉 `const { t } = useTranslation()` 声明，却把 [t] 留在依赖数组里
 * → 指向已删除变量的悬空引用（TS2304 / ReferenceError），round-trip 非幂等。
 *
 * 修复：两端共用 TRANSLATION_DEPENDENCY_HOOKS + resolveHookName（含 useLayoutEffect、
 * 兼容 React.useXxx）。
 */
describe('React restore — hook 依赖清理与 generate 对称', () => {
  let dir: string;
  const lib = createReactI18nLibrary('react-i18next');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-hook-deps-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  // generate 注入态（模拟）：声明 t + 在 hook 里用 t() + 依赖数组含 [t]
  const injected = (hookExpr: string): string =>
    `import React from 'react';\n` +
    `import { useTranslation } from 'react-i18next';\n` +
    `export function C() {\n` +
    `  const { t } = useTranslation();\n` +
    `  ${hookExpr}\n` +
    `  return null;\n` +
    `}\n`;

  it('#5 useLayoutEffect：restore 后清掉 [t]，不留悬空引用', () => {
    const out = restore(injected(`useLayoutEffect(() => { document.title = t('k0'); }, [t]);`), {
      k0: '标题',
    });
    expect(out).toContain('标题'); // 文案还原
    expect(out).not.toContain("t('k0')"); // 调用还原
    expect(out).not.toMatch(/\[\s*t\s*\]/); // 关键：依赖数组里的 t 已清除
    expect(out).not.toMatch(/useTranslation/); // 声明已移除
  });

  it('#6 React.useEffect（成员调用）：restore 后清掉 [t]，不留悬空引用', () => {
    const out = restore(injected(`React.useEffect(() => { document.title = t('k0'); }, [t]);`), {
      k0: '标题',
    });
    expect(out).toContain('标题');
    expect(out).not.toContain("t('k0')");
    expect(out).not.toMatch(/\[\s*t\s*\]/);
    expect(out).not.toMatch(/useTranslation/);
  });

  it('generate 注入侧确实覆盖 useLayoutEffect 与 React.useEffect（对称前提）', () => {
    const code =
      `import React from 'react';\n` +
      `export function C() {\n` +
      `  const t = (k: string) => k;\n` +
      `  useLayoutEffect(() => { document.title = t('x'); }, []);\n` +
      `  React.useEffect(() => { document.title = t('y'); }, []);\n` +
      `  return null;\n` +
      `}\n`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    // 两个 hook 的依赖数组都应被注入 t
    const layoutDeps = out.match(/useLayoutEffect\([^,]+,\s*\[([^\]]*)\]/);
    const effectDeps = out.match(/React\.useEffect\([^,]+,\s*\[([^\]]*)\]/);
    expect(layoutDeps?.[1]).toContain('t');
    expect(effectDeps?.[1]).toContain('t');
  });
});

/**
 * 回归：<Trans> 直接位于 JSX Fragment (<>...</>) 内时，inJsxChildContext 判定只认
 * ts.isJsxElement(parent)、漏了 ts.isJsxFragment，于是还原走「非 JSX 子节点」分支：
 *  - 无 values → createStringLiteral，被当 JSX 文本打印成带引号的 "文案"
 *  - 有 values → 模板字面量，被打印成原样可见的 `文案 ${expr}`
 * 二者都把可见文案渲染成乱码。修复：inJsxChildContext 同时接受 Fragment。
 */
describe('React restore — Fragment 直接子节点的 <Trans>', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-frag-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function restore(src: string, locale: Record<string, string>): string {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, src);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  }

  it('无 values：Fragment 子 <Trans> 还原为纯 JSX 文本，不带引号', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P() {\n` +
        `  return <><Trans i18nKey="k.b" /></>;\n` +
        `}`,
      { 'k.b': '你好世界' },
    );
    expect(out).toContain('你好世界');
    expect(out).not.toContain('"你好世界"'); // 不是被当字符串字面量渲染
    expect(out).not.toContain("'你好世界'");
    expect(out).not.toContain('Trans');
    const sf = ts.createSourceFile('o.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(((sf as any).parseDiagnostics ?? []).length).toBe(0);
  });

  it('带 values：Fragment 子 <Trans> 还原为 JSX {expr}，不残留反引号/${}', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ n }: any) {\n` +
        `  return <><Trans i18nKey="k.n" values={{ n: n }} /></>;\n` +
        `}`,
      { 'k.n': '共 {n} 项' },
    );
    expect(out).toContain('共 {n} 项');
    expect(out).not.toContain('`');
    expect(out).not.toContain('${');
    expect(out).not.toContain('Trans');
  });
});

/**
 * 回归（审计：restore 二次读盘）：ReactRestoreTransformer.transform 应优先使用调用方
 * 已读取的 sourceText，与 ITransformer 对齐。RestoreProcessor 已 readFileSync 一次用于
 * 比对，transform 内再读同一文件属可避免的重复 IO。传入 sourceText 时不应再读盘。
 */
describe('React restore — transform 接受 sourceText 避免二次读盘', () => {
  it('传入 sourceText 时不读盘（文件不存在也能还原）', () => {
    const lib = createReactI18nLibrary('react-i18next');
    const src =
      `import { Trans } from 'react-i18next';\n` +
      `export default function P() {\n` +
      `  return <><Trans i18nKey="k.b" /></>;\n` +
      `}`;
    const out = new ReactRestoreTransformer(lib, '@/plugins/locale').transform(
      '/__no_such_dir__/Restore.tsx', // 不存在：若实现仍 readFileSync 会抛 ENOENT
      { 'k.b': '你好世界' },
      src,
    );
    expect(out).toContain('你好世界');
  });
});

/**
 * 回归（审查 #8）：restore 删除 hook/global 声明（const { t } = useTranslation() /
 * const intl = useIntl() / const intl = getIntl()）此前是无条件的，但 transformTranslationCall/
 * Component 在「locale 缺 key 且无 defaultMessage」时会保留存活调用 → 删声明而调用尚存
 * → 产出 `Cannot find name 't' / intl`（TS2304）。Vue 端早有 isTNameUnusedInScript 守卫、
 * React 的 tImport 也有 finalizeTImport 守卫，唯独 hook/global 声明这一路漏了同构保护。
 *
 * 修复：restore 预扫描翻译调用/组件的存活性；任一存活则保留其声明与库导入（保守保留，
 * 完整 localeMap 的常规往返行为不变）。
 */
describe('React restore — localeMap 不完整时 hook/global 声明守卫（#8）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-incomplete-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (
    code: string,
    locale: Record<string, string>,
    type: 'react-i18next' | 'react-intl' = 'react-i18next',
    tImport = '@/plugins/locale',
  ): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(createReactI18nLibrary(type), tImport).transform(
      file,
      locale,
    );
  };

  it('[react-i18next] 存活 t() 调用 → 保留 useTranslation hook 声明与 import', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <div>{t('k')}{t('missing')}</div>;\n` +
        `}\n`,
      { k: '你好' },
    );
    // 可还原的被替换
    expect(out).toContain('你好');
    // 存活调用与其依赖的 hook 声明 / 库导入都必须保留（否则 t 未定义）
    expect(out).toContain("t('missing')");
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\)/);
    expect(out).toMatch(/import\s*\{[^}]*useTranslation[^}]*\}\s*from\s*['"]react-i18next['"]/);
  });

  it('[react-i18next] 全部可还原 → 移除 hook 声明与 import（常规往返行为不变）', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <div>{t('k')}</div>;\n` +
        `}\n`,
      { k: '你好' },
    );
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
    expect(out).not.toMatch(/useTranslation/);
  });

  it('[react-intl] 存活 intl.formatMessage → 保留 const intl = useIntl() 与 import', () => {
    const out = restore(
      `import { useIntl } from 'react-intl';\n` +
        `export function C() {\n` +
        `  const intl = useIntl();\n` +
        `  return <div>{intl.formatMessage({ id: 'missing' })}</div>;\n` +
        `}\n`,
      {},
      'react-intl',
    );
    expect(out).toMatch(/const\s+intl\s*=\s*useIntl\(\)/);
    expect(out).toMatch(/import\s*\{[^}]*useIntl[^}]*\}\s*from\s*['"]react-intl['"]/);
    expect(out).toContain("id: 'missing'");
  });

  it('[react-intl] intl 用于 formatNumber 等非 formatMessage API → 即便 formatMessage 可还原也须保留 intl 声明', () => {
    // 回归：survivalScan 仅认 intl.formatMessage 为翻译调用；若 formatMessage 能正常还原
    // (restored !== null) 则 keepTranslationVar 保持 false → 删 const intl = useIntl() 与
    // useIntl 导入，残留的 intl.formatNumber 引用未定义 intl（TS2304 / 运行时 ReferenceError）。
    const out = restore(
      `import { useIntl } from 'react-intl';\n` +
        `export function Price({ amount }: { amount: number }) {\n` +
        `  const intl = useIntl();\n` +
        `  const price = intl.formatNumber(amount);\n` +
        `  return <div>{intl.formatMessage({ id: 'k0' })}: {price}</div>;\n` +
        `}\n`,
      { k0: '价格' },
      'react-intl',
    );
    // formatMessage 已还原为文案
    expect(out).toContain('价格');
    // 关键：intl 仍被 formatNumber 使用 → 声明与 import 必须保留
    expect(out).toContain('intl.formatNumber(amount)');
    expect(out, `还原输出：\n${out}`).toMatch(/const\s+intl\s*=\s*useIntl\(\)/);
    expect(out).toMatch(/import\s*\{[^}]*useIntl[^}]*\}\s*from\s*['"]react-intl['"]/);
    // 不得残留对未定义 intl 的引用（编译期 TS2304 的根因）
    const sf = ts.createSourceFile('o.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(
      ((sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? []).length,
    ).toBe(0);
  });

  // 回归（审计 HIGH，ReactRestoreTransformer:393）：类组件 intl 来自 `const { intl } = this.props`
  // （injectIntl HOC 注入），不是 hook 声明 → 此前 hookScopes 为空、守卫在 401 行直接返回 false，
  // 走不到成员访问扫描 → 误删 `const { intl } = this.props` 并解除 HOC，残留 intl.formatNumber 未定义。
  // 函数组件等价场景已有守卫（上一用例）；此处补类组件对称路径。
  it('[react-intl] 类组件 intl 用于 formatNumber → 即便 formatMessage 可还原也须保留 this.props 解构与 HOC', () => {
    const out = restore(
      `import React from 'react';\n` +
        `import { injectIntl, WrappedComponentProps } from 'react-intl';\n` +
        `class PriceInner extends React.Component<WrappedComponentProps & { amount: number }> {\n` +
        `  render() {\n` +
        `    const { intl } = this.props;\n` +
        `    const price = intl.formatNumber(this.props.amount);\n` +
        `    return <div>{intl.formatMessage({ id: 'k0' })}: {price}</div>;\n` +
        `  }\n` +
        `}\n` +
        `export const Price = injectIntl(PriceInner);\n`,
      { k0: '价格' },
      'react-intl',
    );
    // formatMessage 已还原为文案
    expect(out, `还原输出：\n${out}`).toContain('价格');
    // 关键：intl 仍被 formatNumber 使用 → this.props 解构与 injectIntl 包裹必须保留
    expect(out).toContain('intl.formatNumber(this.props.amount)');
    expect(out, `还原输出：\n${out}`).toMatch(/const\s*\{\s*intl\s*\}\s*=\s*this\.props/);
    expect(out).toMatch(/injectIntl\(/);
    // 不得出现对未定义 intl 的引用（TS2304 根因）
    const sfClass = ts.createSourceFile(
      'o.tsx',
      out,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    expect(
      ((sfClass as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? []).length,
    ).toBe(0);
  });

  it('[react-intl] intl 仅用于可还原的 formatMessage → 仍移除声明（不回归）', () => {
    const out = restore(
      `import { useIntl } from 'react-intl';\n` +
        `export function C() {\n` +
        `  const intl = useIntl();\n` +
        `  return <div>{intl.formatMessage({ id: 'k0' })}</div>;\n` +
        `}\n`,
      { k0: '你好' },
      'react-intl',
    );
    expect(out).toContain('你好');
    expect(out).not.toMatch(/useIntl/);
  });

  // 回归：translationVar 的第三种合法绑定来源——模块级 `const intl = getIntl()`（工具为
  // 'other' 作用域生成的标准形态）。此前 translationVarUsedOutsideTranslationCalls 的
  // collect 只收 useIntl hook 与 this.props 两类绑定，getIntl 声明所在作用域不被扫描 →
  // hookScopes 为空直接返回 false → intl.formatNumber 残留引用未被察觉 →
  // cleanupVariableStatements 按 isGlobalFunctionDeclaration 删除声明、finalizeTImport
  // 再删 import，产出悬空 intl（TS2304 / ReferenceError）。
  it('[react-intl] 模块级 getIntl 声明 + intl 用于 formatNumber → 即便 formatMessage 可还原也须保留声明与 import', () => {
    const out = restore(
      `import { getIntl } from '@/plugins/locale';\n` +
        `const intl = getIntl();\n` +
        `export function formatPrice(amount: number) {\n` +
        `  const price = intl.formatNumber(amount);\n` +
        `  return intl.formatMessage({ id: 'k0' }) + price;\n` +
        `}\n`,
      { k0: '价格' },
      'react-intl',
    );
    // formatMessage 已还原为文案
    expect(out).toContain('价格');
    // 关键：intl 仍被 formatNumber 使用 → getIntl 声明与其 import 必须保留
    expect(out).toContain('intl.formatNumber(amount)');
    expect(out, `还原输出：\n${out}`).toMatch(/const\s+intl\s*=\s*getIntl\(\)/);
    expect(out).toMatch(/import\s*\{[^}]*getIntl[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
  });

  it('[react-intl] 模块级 getIntl 声明仅用于可还原的 formatMessage → 仍移除声明与 import（不回归）', () => {
    const out = restore(
      `import { getIntl } from '@/plugins/locale';\n` +
        `const intl = getIntl();\n` +
        `export function label() {\n` +
        `  return intl.formatMessage({ id: 'k0' });\n` +
        `}\n`,
      { k0: '价格' },
      'react-intl',
    );
    expect(out).toContain('价格');
    expect(out).not.toMatch(/getIntl/);
  });
});

/**
 * 回归：还原无 values 的 <Trans> 到 JSX 子节点时，含 JSX 元字符（< > { }）的文案不能直接
 * createJsxText——`<` 非法、`{}` 会被当表达式容器，产出不可编译的 TSX。应改用字符串表达式
 * 容器 `{'...'}` 承载，与带 values 分支的 createJsxFragmentFromTemplate.pushText 守卫对称。
 */
describe('React restore — 无 values 的 JSX 子节点元字符转义', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-jsx-meta-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/i18n').transform(file, locale);
  };

  const hasSyntaxError = (code: string): boolean => {
    const sf = ts.createSourceFile('F.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    // parseDiagnostics 是内部字段，测试里用于判断是否产出合法 TSX
    const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
    return (diagnostics?.length ?? 0) > 0;
  };

  it('文案含 < → 用字符串表达式容器承载，产出合法 TSX', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export const C = () => <div><Trans i18nKey="k" /></div>;\n`,
      { k: '1 < 2' },
    );
    expect(out).toMatch(/\{\s*['"]1 < 2['"]\s*\}/);
    expect(out).not.toMatch(/<div>\s*1 < 2\s*<\/div>/);
    expect(hasSyntaxError(out)).toBe(false);
  });

  it('文案含字面花括号 → 不被当表达式容器，产出合法 TSX', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export const C = () => <div><Trans i18nKey="k" /></div>;\n`,
      { k: '点击 {这里}' },
    );
    expect(out).toMatch(/\{\s*['"]点击 \{这里\}['"]\s*\}/);
    expect(hasSyntaxError(out)).toBe(false);
  });

  it('普通文案（无元字符）→ 仍走 JsxText 快路径', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export const C = () => <div><Trans i18nKey="k" /></div>;\n`,
      { k: '你好世界' },
    );
    expect(out).toContain('你好世界');
    expect(hasSyntaxError(out)).toBe(false);
  });
});

/**
 * React restore：JSX 子节点位置、带 values 的 <Trans> 必须还原成 JSX 形态
 * （文本 + {expr} 表达式容器），而不是模板字面量 `文本 ${expr}`——后者在 JSX 里会被
 * 当字面文本渲染（反引号/${} 原样显示、变量不插值）。
 * 复现来源：electron-react-temp Demo restore 后出现 `<p>`共 ${n} 项`</p>` 之类。
 */
describe('React restore — JSX 混合内容 <Trans values>', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-jsx-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function restore(src: string, locale: Record<string, string>): string {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, src);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  }

  it('多占位符还原为 JSX {expr}，不残留反引号/${}', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ itemCount, totalPrice }: any) {\n` +
        `  return <p><Trans i18nKey="k.total" values={{ itemCount: itemCount, totalPrice: totalPrice }} /></p>;\n` +
        `}`,
      { 'k.total': '共 {itemCount} 项，合计 {totalPrice} 元' },
    );
    expect(out).toContain('共 {itemCount} 项，合计 {totalPrice} 元');
    expect(out).not.toContain('`'); // 不残留模板字面量反引号
    expect(out).not.toContain('${'); // 不残留 JS 插值
    expect(out).not.toContain('Trans');
  });

  it('单占位符还原为 JSX {expr}', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ username }: any) {\n` +
        `  return <p><Trans i18nKey="k.user" values={{ username: username }} /></p>;\n` +
        `}`,
      { 'k.user': '用户名: {username}' },
    );
    expect(out).toContain('用户名: {username}');
    expect(out).not.toContain('`');
    expect(out).not.toContain('${');
  });

  it('文案含 JSX 元字符（<、>）时用字符串表达式容器承载，不产生非法 JSX', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ count }: any) {\n` +
        `  return <p><Trans i18nKey="k.cmp" values={{ count: count }} /></p>;\n` +
        `}`,
      { 'k.cmp': '当 {count} < 10 时' },
    );
    expect(out).toContain('< 10'); // 原样保留 < 字符
    expect(out).not.toContain('Trans');
    // 还原结果必须是合法 TSX（无解析错误），证明 < 没有被当作非法 JsxText
    const sf = ts.createSourceFile('o.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const diagnostics = (sf as any).parseDiagnostics ?? [];
    expect(diagnostics.length).toBe(0);
  });

  it('复杂表达式（?? 兜底）的 value 也能还原回原表达式', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P({ form }: any) {\n` +
        `  return <p><Trans i18nKey="k.status" values={{ value: form.getFieldValue('status') ?? '未知' }} /></p>;\n` +
        `}`,
      { 'k.status': '状态 {value} 已记录' },
    );
    expect(out).toContain("form.getFieldValue('status') ?? '未知'");
    expect(out).not.toContain('{value}'); // 占位符已代回真实表达式
    expect(out).not.toContain('"状态'); // 不是被当成引号字符串
  });
});

/**
 * 回归：restore 清理 i18n 库 import 时只能摘除工具注入的具名（Trans / useTranslation /
 * FormattedMessage / useIntl ...），不能整条删除。
 *
 * 根因（修复前）：ReactImportManager.cleanupImports 在 moduleSpecifier === library.packageName
 * 且无存活翻译用法时 createNotEmittedStatement 整条移除 import，会把用户在同一行手写的
 * 非 i18n 导入（react-i18next 的 I18nextProvider、react-intl 的 IntlProvider）一并删除，
 * 产出 `Cannot find name '...'`（TS2304）的不可编译代码。Vue 端 cleanupImports 早已用
 * removeNamedImports 精确摘除，这里与之对齐。
 */
describe('React restore — 库 import 精确摘除（保留同行非 i18n 导入）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-libimp-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (
    code: string,
    locale: Record<string, string>,
    libType: ReactI18nLibraryType = 'react-i18next',
  ): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary(libType);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  const noParseErrors = (out: string): void => {
    const sf = ts.createSourceFile('o.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(
      ((sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? []).length,
    ).toBe(0);
  };

  it('react-i18next：Trans 全部还原 → 摘除 Trans，保留同行 I18nextProvider', () => {
    const out = restore(
      `import { Trans, I18nextProvider } from 'react-i18next';\n` +
        `export default function App({ i18n }: any) {\n` +
        `  return <I18nextProvider i18n={i18n}><Trans i18nKey="k" /></I18nextProvider>;\n` +
        `}`,
      { k: '你好世界' },
    );
    expect(out).toContain('你好世界');
    expect(out).not.toContain('Trans'); // 工具注入名已摘
    expect(out).toContain('I18nextProvider'); // 用户手写导入与用法保留
    expect(out).toMatch(/import\s*\{\s*I18nextProvider\s*\}\s*from\s*['"]react-i18next['"]/);
    noParseErrors(out);
  });

  it('react-intl：FormattedMessage 全部还原 → 摘除 FormattedMessage，保留同行 IntlProvider', () => {
    const out = restore(
      `import { FormattedMessage, IntlProvider } from 'react-intl';\n` +
        `export default function App({ intl }: any) {\n` +
        `  return <IntlProvider locale="zh"><FormattedMessage id="k" /></IntlProvider>;\n` +
        `}`,
      { k: '你好世界' },
      'react-intl',
    );
    expect(out).toContain('你好世界');
    expect(out).not.toContain('FormattedMessage');
    expect(out).toContain('IntlProvider');
    expect(out).toMatch(/import\s*\{\s*IntlProvider\s*\}\s*from\s*['"]react-intl['"]/);
    noParseErrors(out);
  });

  it('整行都是工具注入名（无其它导入）→ 仍整条移除', () => {
    const out = restore(
      `import { Trans } from 'react-i18next';\n` +
        `export default function P() {\n` +
        `  return <Trans i18nKey="k" />;\n` +
        `}`,
      { k: '你好世界' },
    );
    expect(out).toContain('你好世界');
    expect(out).not.toMatch(/from\s*['"]react-i18next['"]/);
    noParseErrors(out);
  });

  it('改名导入（import { Trans as T }）属用户代码 → 不摘除', () => {
    const out = restore(
      `import { Trans as T, I18nextProvider } from 'react-i18next';\n` +
        `export default function P({ i18n }: any) {\n` +
        `  return <I18nextProvider i18n={i18n}><T i18nKey="x" /></I18nextProvider>;\n` +
        `}`,
      {}, // 无 locale，<T> 不被工具识别为 Trans，保持原样
    );
    expect(out).toMatch(/Trans as T/);
    expect(out).toContain('I18nextProvider');
    noParseErrors(out);
  });
});

/**
 * 回归：还原 react-i18next 的混合解构 `const { t, i18n } = useTranslation()` 时，cleanupVariableStatements
 * 不能因 isHookDeclaration 命中就把整条声明删掉——否则存活的 `i18n` 引用会报 TS2304。
 *
 * 根因（修复前）：isHookDeclaration 对 `{ t }` 与 `{ t, i18n }` 都返回 true，循环里先命中
 * 「hook 声明整条删除」分支，使下方「仅删翻译项、重建解构保留其余绑定」的逻辑永不可达。
 */
describe('React restore — useTranslation 混合解构保留非翻译绑定', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-mixed-hook-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/i18n').transform(file, locale);
  };

  it('t 全部可还原但 i18n 仍被引用 → 保留 const { i18n } = useTranslation()', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t, i18n } = useTranslation();\n` +
        `  const change = () => i18n.changeLanguage('en');\n` +
        `  return <button onClick={change}>{t('k')}</button>;\n` +
        `}\n`,
      { k: '你好' },
    );
    // i18n 绑定与引用都保留
    expect(out).toMatch(/const\s*\{\s*i18n\s*\}\s*=\s*useTranslation\(\)/);
    expect(out).toContain('i18n.changeLanguage');
    // t 已被还原、不再出现在解构里
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
    expect(out).not.toMatch(/\{\s*t\s*,\s*i18n\s*\}/);
  });

  it('纯 t 解构（无其他绑定）→ 整条删除，行为不变', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <span>{t('k')}</span>;\n` +
        `}\n`,
      { k: '你好' },
    );
    expect(out).toContain('你好');
    expect(out).not.toMatch(/useTranslation\(\)/);
  });

  it('t 仍有存活调用（key 缺失）→ 整条解构保留，不丢 t/i18n', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t, i18n } = useTranslation();\n` +
        `  void i18n;\n` +
        `  return <span>{t('missing')}</span>;\n` +
        `}\n`,
      {},
    );
    expect(out).toMatch(/const\s*\{\s*t\s*,\s*i18n\s*\}\s*=\s*useTranslation\(\)/);
    expect(out).toContain("t('missing')");
  });
});

/**
 * 回归：还原混合解构 `const { t, i18n } = useTranslation()` 且所有 t() 都能从 locale 还原时，
 * cleanupVariableStatements 会保留 `const { i18n } = useTranslation()`，但 cleanupImports 在
 * keepLibraryImport=false 时仍整条删除 `import { useTranslation } from 'react-i18next'`，
 * 产出引用未定义符号的不可编译代码（TS2304）。
 *
 * 根因（修复前）：keepLibraryImport 只由 survivalScan 在「翻译调用/组件存活」时置位，完全不感知
 * 被保留下来的非翻译 hook 绑定（i18n）。修复：survivalScan 检测到混合解构 hook 含残余非翻译绑定时，
 * 用独立标志保留库 import（仅作用于 import 清理，不影响 HOC 解除门控）。
 *
 * 注意：姊妹文件 react-restore-mixed-hook-destructure.test.ts 只断言「绑定保留」，未断言「import 保留」，
 * 故未拦住此 bug；本文件专门补 import 存活断言。
 */
describe('React restore — 混合解构保留 i18n 时库 import 必须存活', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-import-survival-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/i18n').transform(file, locale);
  };

  it('t 全部可还原但 i18n 仍被引用 → 保留 import { useTranslation }', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t, i18n } = useTranslation();\n` +
        `  const change = () => i18n.changeLanguage('en');\n` +
        `  return <button onClick={change}>{t('k')}</button>;\n` +
        `}\n`,
      { k: '你好' },
    );
    // 残余绑定保留（既有行为）
    expect(out).toMatch(/const\s*\{\s*i18n\s*\}\s*=\s*useTranslation\(\)/);
    // 关键修复：useTranslation 的 import 必须仍在，否则 const { i18n } = useTranslation() 引用未定义
    expect(out).toMatch(/import\s*\{\s*useTranslation\s*\}\s*from\s*['"]react-i18next['"]/);
    // t 已被还原
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
  });

  it('纯 t 解构（无残余绑定）→ 库 import 整条删除，行为不变', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <span>{t('k')}</span>;\n` +
        `}\n`,
      { k: '你好' },
    );
    expect(out).toContain('你好');
    expect(out).not.toMatch(/useTranslation/);
  });
});

/**
 * 回归（MEDIUM）：部分还原时，cleanupHookDependencies 必须与 cleanupImports /
 * cleanupVariableStatements 一样受 keepTranslationVar 守卫。
 *
 * 根因（修复前）：cleanupHookDependencies 无 keep 守卫，无条件把 t 从 hook 依赖数组剥离。
 * 当某个 t() 因 key 缺失/动态 key 未被还原时，translation 变量声明与 import 被保留
 * （keepTranslationVar=true），但 deps 数组里的 t 仍被删掉 → 回调体引用 t 而 deps 漏 t，
 * 触发 react-hooks/exhaustive-deps 违规 + 语言切换时闭包陈旧。
 *
 * 修复：cleanupHookDependencies(node, library, keepTranslationVar)，keepTranslationVar=true
 * 时直接返回原节点。
 */
describe('React restore — 部分还原时保留 hook deps 里的 t（keepTranslationVar 守卫）', () => {
  let dir: string;
  const lib = createReactI18nLibrary('react-i18next');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-partial-hook-deps-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(lib, '@/i18n').transform(file, locale);
  };

  // 一个 t() 可还原（k0 在 locale），另一个 t() 不可还原（missing 不在 locale）
  const SRC =
    `import React from 'react';\n` +
    `import { useTranslation } from 'react-i18next';\n` +
    `export function C() {\n` +
    `  const { t } = useTranslation();\n` +
    `  const fn = React.useCallback(() => t('missing') + t('k0'), [t]);\n` +
    `  return <button onClick={fn} />;\n` +
    `}\n`;

  it('有 t() 调用存活 → 声明、import、deps 里的 t 都保留', () => {
    const out = restore(SRC, { k0: '标题' });

    // 存活的 t('missing') 仍在（locale 缺该 key，无法还原）
    expect(out).toContain("t('missing')");
    // 可还原的 t('k0') 被还原为中文
    expect(out).toContain('标题');
    // translation 变量声明与 import 被保留（既有守卫）
    expect(out).toContain('useTranslation');
    // 关键：deps 数组里的 t 不被剥离 —— 不留 deps 漏项
    expect(out).toMatch(/\[\s*t\s*\]/);
  });

  it('对照：全部 t() 可还原 → t 声明与 deps 一并清除（既有行为不回归）', () => {
    const allRestorable =
      `import React from 'react';\n` +
      `import { useTranslation } from 'react-i18next';\n` +
      `export function C() {\n` +
      `  const { t } = useTranslation();\n` +
      `  const fn = React.useCallback(() => t('k0'), [t]);\n` +
      `  return <button onClick={fn} />;\n` +
      `}\n`;
    const out = restore(allRestorable, { k0: '标题' });

    expect(out).toContain('标题');
    expect(out).not.toContain("t('k0')");
    expect(out).not.toMatch(/useTranslation/);
    expect(out).not.toMatch(/\[\s*t\s*\]/);
  });
});

/**
 * Restore 守卫：删除 tImport `import { t } from '@/plugins/locale'` 前必须确认 t 已无引用。
 *
 * 根因（修复前）：restore 逐节点 cleanupImports 无条件摘除 t，但 transformTranslationCall 在
 * 「key 不在 source locale 且无 defaultMessage」时会保留存活的 t() 调用 → 删了仍被引用的 import
 * → 产出 `Cannot find name 't'`（TS2304）。修复后改由收尾 pass + isImportedNameUnused 守卫。
 */
describe('React restore — tImport t 导入删除守卫', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-timport-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  it('存活 t() 调用（key 不在 locale）→ 保留 import（不产出未定义 t）', () => {
    const out = restore(
      `import { t } from '@/plugins/locale';\n` + `export const f = () => t('missing.key');\n`,
      {}, // key 不在 map → 调用无法还原，原样保留
    );
    // 关键：import 必须保留，否则 t 未定义
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toContain("t('missing.key')");
  });

  it('全部 t() 可还原（key 在 locale）→ 调用消失，删除已无用的 import', () => {
    const out = restore(
      `import { t } from '@/plugins/locale';\n` + `export const f = () => t('k');\n`,
      { k: '你好' },
    );
    expect(out).not.toMatch(/from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
  });

  it('部分可还原 + 部分存活 → t 仍被引用，保留 import', () => {
    const out = restore(
      `import { t } from '@/plugins/locale';\n` +
        `export const f = () => t('k');\n` +
        `export const g = () => t('missing');\n`,
      { k: '你好' },
    );
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toContain('你好'); // 可还原的已替换
    expect(out).toContain("t('missing')"); // 存活调用保留
  });

  it('混合命名导入：t 存活 → t 与同路径其他命名都保留', () => {
    const out = restore(
      `import { t, foo } from '@/plugins/locale';\n` +
        `export const x = foo;\n` +
        `export const f = () => t('missing');\n`,
      {},
    );
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toMatch(/import\s*\{[^}]*\bfoo\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
  });

  it('混合命名导入：t 全部还原 → 仅摘 t，保留其他命名', () => {
    const out = restore(
      `import { t, foo } from '@/plugins/locale';\n` +
        `export const x = foo;\n` +
        `export const f = () => t('k');\n`,
      { k: '你好' },
    );
    // foo 保留、t 摘除
    expect(out).toMatch(/import\s*\{\s*foo\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).not.toMatch(/\bt\b\s*,\s*foo|foo\s*,\s*\bt\b/);
    expect(out).toContain('你好');
  });
});

/**
 * 回归（审计 Med）：restore 清理不得按名误删「来源与 i18n 无关」的同名解构 / 依赖。
 *
 * 根因（修复前）：
 *  - cleanupVariableStatements 通用分支对任意对象解构按名剥离 t/intl，不校验初始化器来源
 *    → `const { t } = useTemperature()` 被整条删除，t 运行时 undefined（TS2304 / ReferenceError）。
 *  - cleanupHookDependencies 同样按名从 deps 数组删 t/intl
 *    → `useMemo(() => compute(t), [t])`（t 为温度）被删依赖，留下悬空 deps + 陈旧闭包。
 *
 * 修复：解构清理收窄到 `this.props`（HOC 注入形态）；依赖清理收窄到「回调体内 t 的出现
 * 全部是翻译调用被调名」时才剥离。本测试覆盖「不相关同名」必须原样保留。
 *
 * 注：合法路径（const { t } = useTranslation() / const { t } = this.props /
 * useLayoutEffect 注入 [t] 的对称移除）由 react-class-hoc-restore、
 * react-hook-deps-restore-symmetry 等既有用例守护，此处不重复。
 */
describe('React restore — 不误删来源无关的同名 t/intl', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-unrelated-var-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restoreI18next = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(
      createReactI18nLibrary('react-i18next'),
      '@/plugins/locale',
    ).transform(file, locale);
  };

  it('变量声明：`const { t } = useTemperature()`（非 i18n 来源）在 restore 后整条保留', () => {
    const code =
      `import { useTranslation } from 'react-i18next';\n` +
      `function useTemperature() { return { t: 25 }; }\n` +
      `export function A() {\n` +
      `  const { t } = useTranslation();\n` +
      `  return <p>{t('a')}</p>;\n` +
      `}\n` +
      `export function B() {\n` +
      `  const { t } = useTemperature();\n` +
      `  return <span>{t}</span>;\n` +
      `}\n`;

    const out = restoreI18next(code, { a: '你好' });

    // A 的 i18n 调用与声明被正常还原/清理
    expect(out).toContain('你好');
    expect(out).not.toContain('useTranslation()');
    // 关键：B 的不相关解构必须原样保留，未被按名删除
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTemperature\(\)/);
  });

  it('依赖数组：`useMemo(() => t * 2, [t])`（t 为非 i18n 值）在 restore 后保留 [t]', () => {
    const code =
      `import { useMemo } from 'react';\n` +
      `import { useTranslation } from 'react-i18next';\n` +
      `function useTemp() { return 25; }\n` +
      `export function A() {\n` +
      `  const { t } = useTranslation();\n` +
      `  return <p>{t('a')}</p>;\n` +
      `}\n` +
      `export function B() {\n` +
      `  const t = useTemp();\n` +
      `  const v = useMemo(() => t * 2, [t]);\n` +
      `  return <span>{v}</span>;\n` +
      `}\n`;

    const out = restoreI18next(code, { a: '你好' });

    expect(out).toContain('你好');
    // 关键：不相关 hook 的依赖项 [t] 必须保留（否则 stale closure / exhaustive-deps 违规）
    expect(out).toMatch(/useMemo\([^,]+,\s*\[\s*t\s*\]\)/);
    expect(out).toMatch(/const\s+t\s*=\s*useTemp\(\)/);
  });
});

/**
 * 回归：t 作为**裸标识符值**被引用（透传 / 赋值 / JSX 属性）而非翻译调用时，restore 的存活守卫
 * translationVarUsedOutsideTranslationCalls 只识别成员访问 `t.<member>`、漏判裸 Identifier。
 * 当文件内所有 t('key') 都能还原（无残留翻译调用）时 keepTranslationVar 保持 false →
 * cleanupVariableStatements 删 `const { t } = useTranslation()`、cleanupImports 删 import，
 * 却把裸 t 引用留下 → `t is not defined`（ReferenceError / TS2304）。
 *
 * 对比：同库 react-restore-cleanup 的 callbackUsesVarOutsideTranslationCalls 对裸 Identifier 判定正确
 * （依赖数组 [t] 会被保留），两处口径相反正是缺陷特征。
 * 修复时须排除解构绑定名 t 自身（const { t } 的 BindingElement.name 也是 Identifier t），
 * 否则 keepTranslationVar 恒 true、常规往返删不掉声明（由本文件既有「全部可还原→删声明」用例守护）。
 */
describe('React restore — t 作为裸值引用时保留声明与 import（回归）', () => {
  let dir: string;
  const lib = createReactI18nLibrary('react-i18next');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-bare-t-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  it('passToChild(t) 裸值透传 + t() 全部可还原 → 保留 const { t } = useTranslation() 与 import', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function Foo() {\n` +
        `  const { t } = useTranslation();\n` +
        `  const label = t('greeting');\n` +
        `  passToChild(t);\n` +
        `  return <div>{label}</div>;\n` +
        `}\n`,
      { greeting: '你好' },
    );
    // 可还原的被替换
    expect(out).toContain('你好');
    // 裸值引用仍在
    expect(out).toContain('passToChild(t)');
    // 关键：t 仍被裸值引用 → 声明与 import 必须保留，否则 t 未定义
    expect(out, `还原输出：\n${out}`).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\)/);
    expect(out, `还原输出：\n${out}`).toMatch(
      /import\s*\{[^}]*useTranslation[^}]*\}\s*from\s*['"]react-i18next['"]/,
    );
  });

  it('<Child t={t}/> JSX 属性裸值 + t() 全部可还原 → 保留声明与 import', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function Foo() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <Child t={t} title={t('greeting')} />;\n` +
        `}\n`,
      { greeting: '你好' },
    );
    expect(out).toContain('你好');
    expect(out).toMatch(/t=\{t\}/);
    expect(out, `还原输出：\n${out}`).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\)/);
    expect(out, `还原输出：\n${out}`).toMatch(
      /import\s*\{[^}]*useTranslation[^}]*\}\s*from\s*['"]react-i18next['"]/,
    );
  });

  it('对照：t 仅出现在可还原的翻译调用、无裸值引用 → 仍删声明与 import（不回归）', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function Foo() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <div>{t('greeting')}</div>;\n` +
        `}\n`,
      { greeting: '你好' },
    );
    expect(out).toContain('你好');
    expect(out).not.toContain("t('greeting')");
    expect(out).not.toMatch(/useTranslation/);
  });
});

/**
 * Bug 1：react-intl restore 误删「改名的」useIntl 声明 → ReferenceError。
 *
 * `const myIntl = useIntl()`（绑定名非 intl）时，isTranslationCall 只认 receiver 为 intl，
 * `myIntl.formatMessage(...)` 不会被还原（正确）。但删除侧（isHookDeclaration）旧逻辑只看
 * `Identifier = useIntl()`、不校验绑定名，导致声明与 import 被删、调用残留 → myIntl 未定义。
 * 与 react-i18next 端 `const { t: tr } = useTranslation()` 会被保留的行为对齐。
 */
describe('React restore — react-intl 改名 useIntl 声明保守保留（Bug 1）', () => {
  let dir: string;
  const lib = createReactI18nLibrary('react-intl');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-renamed-intl-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  it('const myIntl = useIntl()：声明、import、调用全部保留（不产出未定义标识符）', () => {
    const out = restore(
      `import React from 'react';\n` +
        `import { useIntl } from 'react-intl';\n` +
        `export const App = () => {\n` +
        `  const myIntl = useIntl();\n` +
        `  return <div>{myIntl.formatMessage({ id: 'a' })}</div>;\n` +
        `};\n`,
      { a: '你好' },
    );
    // 声明保留
    expect(out, `还原输出：\n${out}`).toMatch(/const\s+myIntl\s*=\s*useIntl\(\)/);
    // import 保留
    expect(out, `还原输出：\n${out}`).toMatch(
      /import\s*\{[^}]*useIntl[^}]*\}\s*from\s*['"]react-intl['"]/,
    );
    // 调用原样保留（改名 intl 不被还原）
    expect(out).toContain("myIntl.formatMessage({ id: 'a' })");
    expect(out).not.toContain('你好');
  });

  it('对照：标准 const intl = useIntl() 且调用可还原 → 照常删声明与 import（不回归）', () => {
    const out = restore(
      `import React from 'react';\n` +
        `import { useIntl } from 'react-intl';\n` +
        `export const App = () => {\n` +
        `  const intl = useIntl();\n` +
        `  return <div>{intl.formatMessage({ id: 'a' })}</div>;\n` +
        `};\n`,
      { a: '你好' },
    );
    expect(out).toContain('你好');
    expect(out).not.toMatch(/useIntl/);
    expect(out).not.toContain('formatMessage');
  });
});

/**
 * Bug 3：renameComponent 未受 keep 守卫门控，与 unwrapHOC 不对称。
 *
 * 用户手写函数式 HOC（injectIntl）+ locale 缺 key 时，keep 守卫为 true → `const Injected = ...`
 * 被保留（正确），unwrapHOC/cleanupHOCPropsType 也被跳过；但 renameComponent 在守卫外无条件执行，
 * 把 `<Injected />` 改成 `<MyComp />` → 绕过 HOC 渲染裸类，运行时 this.props.intl undefined。
 */
describe('React restore — renameComponent 受 keep 守卫门控（Bug 3）', () => {
  let dir: string;
  const lib = createReactI18nLibrary('react-intl');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-rename-guard-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  const hocSource =
    `import { injectIntl } from 'react-intl';\n` +
    `class MyComp extends React.Component {\n` +
    `  render() { return <div>{this.props.intl.formatMessage({ id: 'missing.key' })}</div>; }\n` +
    `}\n` +
    `const Injected = injectIntl(MyComp);\n` +
    `export const App = () => <Injected />;\n`;

  it('locale 缺 key（keep 守卫触发）：<Injected /> 保持原样，不被改名为 <MyComp />', () => {
    const out = restore(hocSource, { other: '你好' });
    // 守卫触发：HOC 包裹声明保留
    expect(out, `还原输出：\n${out}`).toContain('const Injected = injectIntl(MyComp)');
    // 关键：JSX 引用不得被改名绕过 HOC
    expect(out, `还原输出：\n${out}`).toMatch(/<Injected\s*\/>/);
    expect(out).not.toMatch(/<MyComp\s*\/>/);
  });

  it('对照：locale 完整时正常还原（不回归）', () => {
    const out = restore(hocSource, { 'missing.key': '你好' });
    // 完整还原：文案落地
    expect(out).toContain('你好');
    // 无存活翻译用法 → HOC 解除、类名复原
    expect(out).not.toContain('injectIntl');
  });
});

/**
 * Bug：手写 values 的对象简写 `{ count }` 与展开 `{ ...rest }` 在 restore 端被
 * extractObjectLiteralProperties 静默丢弃 → values 为空 → 占位符整体字面化，
 * 变量引用被删且无告警。Vue 端已处理（简写按同名映射、展开保留原调用），React 需对齐。
 */
describe('React restore — 手写 values 对象简写/展开（防静默丢变量）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-shorthand-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const lib = createReactI18nLibrary('react-i18next');
    const file = path.join(dir, 'S.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  it('对象简写 { count }：还原为模板字面量插值，不得把 {count} 字面化', () => {
    const code =
      `import { t } from '@/plugins/locale';\n` +
      `export function Cart({ count }: { count: number }) {\n` +
      `  return <div>{t('cart.count', { count })}</div>;\n` +
      `}\n`;
    // i18next 系 locale 写盘形态为双花括号
    const out = restore(code, { 'cart.count': '共 {{count}} 项' });
    // 变量以插值形式存活
    expect(out, `还原输出：\n${out}`).toContain('${count}');
    // 不得残留字面化的花括号占位符
    expect(out).not.toContain('共 {count} 项');
    expect(out).not.toContain('共 {{count}} 项');
  });

  it('展开 { ...rest }：无法静态解析，保留原 t() 调用不还原', () => {
    const code =
      `import { t } from '@/plugins/locale';\n` +
      `export function Cart(rest: { count: number }) {\n` +
      `  return <div>{t('cart.count', { ...rest })}</div>;\n` +
      `}\n`;
    const out = restore(code, { 'cart.count': '共 {{count}} 项' });
    // 原调用保留，源码语义不被破坏
    expect(out, `还原输出：\n${out}`).toContain(`t('cart.count'`);
    expect(out).not.toContain('共 {{count}} 项');
    // import 也必须保留（调用存活）
    expect(out).toContain('@/plugins/locale');
  });

  it('<Trans> values 简写：同样以插值还原', () => {
    const code =
      `import { Trans } from 'react-i18next';\n` +
      `export function Cart({ count }: { count: number }) {\n` +
      `  return <div><Trans i18nKey="cart.count" values={{ count }} /></div>;\n` +
      `}\n`;
    const out = restore(code, { 'cart.count': '共 {{count}} 项' });
    // 正确形态是 JSX 片段插值 `<>共 {count} 项</>`，而非整串字面化 `{"共 {count} 项"}`
    expect(out, `还原输出：\n${out}`).toMatch(/共 \{count\} 项/);
    expect(out).not.toContain('"共 {count} 项"');
    expect(out).not.toContain('Trans');
  });
});

/**
 * 回归（本轮 shorthand 修复的连带影响）：extractObjectLiteralProperties 的简写分支对
 * 所有调用点生效，react-intl 的消息描述符提取（extractFormatMessageInfo /
 * extractDefineMessages）把 props.id / props.defaultMessage 直接赋给 MessageInfo——
 * `formatMessage({ id, defaultMessage })`（简写变量）时它们变成 {node,text} 对象，
 * 穿过 isValidMessage 后在 normalizeRestoreMessage 对非字符串调 .replace 抛 TypeError，
 * 整文件 restore 中断。描述符字段必须只接受字符串。
 */
describe('React restore — 简写变量描述符不得中断还原', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-desc-shorthand-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const lib = createReactI18nLibrary('react-intl');
    const file = path.join(dir, 'D.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  it('formatMessage({ id, defaultMessage }) 简写变量：不抛异常，保留原调用', () => {
    const code =
      `import { useIntl } from 'react-intl';\n` +
      `export function C({ id, defaultMessage }: { id: string; defaultMessage: string }) {\n` +
      `  const intl = useIntl();\n` +
      `  return <div>{intl.formatMessage({ id, defaultMessage })}</div>;\n` +
      `}\n`;
    let out = '';
    expect(() => {
      out = restore(code, { other: '你好' });
    }).not.toThrow();
    // 动态描述符无法静态还原：原调用保留，不产出 [object Object]
    expect(out, `还原输出：\n${out}`).toContain('intl.formatMessage({ id, defaultMessage })');
    expect(out).not.toContain('[object Object]');
  });

  it('defineMessages 值含简写变量：不抛异常，引用处保留原调用', () => {
    const code =
      `import { defineMessages, useIntl } from 'react-intl';\n` +
      `const defaultMessage = '动态';\n` +
      `const messages = defineMessages({ greet: { id: 'g.k', defaultMessage } });\n` +
      `export function C() {\n` +
      `  const intl = useIntl();\n` +
      `  return <div>{intl.formatMessage(messages.greet)}</div>;\n` +
      `}\n`;
    let out = '';
    expect(() => {
      out = restore(code, { other: '你好' });
    }).not.toThrow();
    expect(out).not.toContain('[object Object]');
  });
});

/**
 * 审计确认的三处 restore 半还原产物。共用一个临时目录与 restore 辅助。
 */
describe('React restore — 审计修复合集', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-audit-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (
    code: string,
    locale: Record<string, string>,
    libType: ReactI18nLibraryType = 'react-i18next',
  ): string => {
    const file = path.join(dir, 'A.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(
      createReactI18nLibrary(libType),
      '@/plugins/locale',
    ).transform(file, locale, code);
  };

  /** 语法（非语义）错误数：足以捕获重复声明、孤立关键字等结构性错误。 */
  const syntaxErrorCount = (code: string): number => {
    const result = ts.transpileModule(code, {
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest },
      fileName: 'a.tsx',
    });
    return (result.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error)
      .length;
  };

  /**
   * P1：cleanupHookDependencies 的「回调是否还用 t」按名硬匹配任意 Identifier，
   * 对象键 `{ t: ... }`、成员名 `styles.t` 都算使用 → deps 保留 `[t]`；而删声明那侧
   * （ReactRestoreTransformer）走 isIdentifierValueReference 只认值引用 → 声明与 import 被删。
   * 口径不对称的产物是 `useMemo(..., [t])` 引用已删除的 t（TS2304）。
   */
  describe('hook 依赖数组与声明删除口径对称', () => {
    it('对象键 { t: Date.now() } 不算使用：声明与 deps 里的 t 一并清理', () => {
      const code =
        `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  const m = useMemo(() => ({ t: Date.now(), label: t('k') }), [t]);\n` +
        `  return <div>{m.label}</div>;\n` +
        `}\n`;
      const out = restore(code, { k: '标签' });

      expect(out, `还原输出：\n${out}`).toContain('"标签"');
      // 声明被删 → deps 必须同步清空，否则引用未定义的 t
      expect(out).not.toContain('useTranslation');
      expect(out).not.toMatch(/\[\s*t\s*\]/);
      expect(syntaxErrorCount(out)).toBe(0);
    });

    it('成员名 styles.t 不算使用：同样一并清理', () => {
      const code =
        `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  const m = useMemo(() => styles.t + t('k'), [t]);\n` +
        `  return <div>{m}</div>;\n` +
        `}\n`;
      const out = restore(code, { k: '标签' });
      expect(out).not.toContain('useTranslation');
      expect(out).not.toMatch(/\[\s*t\s*\]/);
    });

    it('回归：t 被当普通值真使用（compute(t)）时，声明与 deps 都保留', () => {
      const code =
        `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  const m = useMemo(() => compute(t) + t('k'), [t]);\n` +
        `  return <div>{m}</div>;\n` +
        `}\n`;
      const out = restore(code, { k: '标签' });
      expect(out, `还原输出：\n${out}`).toContain('useTranslation');
      expect(out).toMatch(/\[\s*t\s*\]/);
    });
  });

  /**
   * P1：unwrapHOC 只解 `HOC(裸标识符)`；`withTranslation()(connect()(X))`、路由表对象里的
   * HOC 解不掉、原样保留，而 survivalScan 不统计 HOC 调用 → import 照删 → ReferenceError。
   */
  describe('解不掉的 HOC 调用必须保留库导入', () => {
    it('withTranslation()(connect()(X))：HOC 原样保留时 import 也保留', () => {
      const code =
        `import { withTranslation } from 'react-i18next';\n` +
        `import { connect } from 'react-redux';\n` +
        `class Panel extends React.Component {\n` +
        `  render() { const { t } = this.props; return <div>{t('k')}</div>; }\n` +
        `}\n` +
        `export default withTranslation()(connect()(Panel));\n`;
      const out = restore(code, { k: '标签' });

      expect(out, `还原输出：\n${out}`).toContain('withTranslation()(connect()(Panel))');
      expect(out).toContain(`from 'react-i18next'`);
      expect(out).toContain('withTranslation');
    });

    it('路由表对象里的 HOC：同样保留 import', () => {
      const code =
        `import { withTranslation } from 'react-i18next';\n` +
        `class Panel extends React.Component {\n` +
        `  render() { const { t } = this.props; return <div>{t('k')}</div>; }\n` +
        `}\n` +
        `export const routes = [{ path: '/p', component: withTranslation()(Panel) }];\n`;
      const out = restore(code, { k: '标签' });
      expect(out, `还原输出：\n${out}`).toContain('withTranslation()(Panel)');
      // 断言必须落在 import 行上：HOC 调用文本本身也含 'withTranslation'，泛匹配无法证伪
      expect(out).toMatch(/import\s*\{[^}]*withTranslation[^}]*\}\s*from\s*['"]react-i18next['"]/);
    });

    it('react-intl 同型：injectIntl(connect()(X)) 保留 import（走 library 抽象，非硬编码库名）', () => {
      const code =
        `import { injectIntl } from 'react-intl';\n` +
        `import { connect } from 'react-redux';\n` +
        `class Panel extends React.Component {\n` +
        `  render() { const { intl } = this.props; return <div>{intl.formatMessage({ id: 'k' })}</div>; }\n` +
        `}\n` +
        `export default injectIntl(connect()(Panel));\n`;
      const out = restore(code, { k: '标签' }, 'react-intl');
      expect(out, `还原输出：\n${out}`).toContain('injectIntl(connect()(Panel))');
      expect(out).toMatch(/import\s*\{[^}]*injectIntl[^}]*\}\s*from\s*['"]react-intl['"]/);
    });

    it('回归：可解包的 HOC（工具自产形态）照常解除、import 照常摘除', () => {
      const code =
        `import { withTranslation, WithTranslation } from 'react-i18next';\n` +
        `class PanelWithOutIntl extends React.Component<WithTranslation> {\n` +
        `  render() { const { t } = this.props; return <div>{t('k')}</div>; }\n` +
        `}\n` +
        `export default withTranslation()(PanelWithOutIntl);\n`;
      const out = restore(code, { k: '标签' });
      expect(out, `还原输出：\n${out}`).not.toContain('withTranslation');
      expect(out).toContain('class Panel');
    });
  });

  /**
   * P2：带 values 的 <Trans> 还原到「无占位符」文案时，工厂在数量比对之前就返回
   * StringLiteral，绕过失配守卫；JSX 子节点位置直接落进 children 位 → 引号被当渲染文本，
   * values 静默丢弃。正确行为是判失配、返回 null 保留原组件。
   */
  describe('values 非空但文案无占位符 → 保留原组件', () => {
    it('<Trans i18nKey values={{count}} /> + 无占位符 locale 值 → 原组件保留', () => {
      const code =
        `import { Trans } from 'react-i18next';\n` +
        `export function C({ count }: { count: number }) {\n` +
        `  return <div><Trans i18nKey="k" values={{ count }} /></div>;\n` +
        `}\n`;
      const out = restore(code, { k: '没有占位符的文案' });

      expect(out, `还原输出：\n${out}`).toContain('<Trans');
      expect(out).toContain('values={{ count }}');
      // 关键反例：不得把文案带引号落进 JSX children，也不得丢掉 values
      expect(out).not.toContain('"没有占位符的文案"');
      expect(out).toContain(`from 'react-i18next'`);
    });

    it('t() 调用形态同样保留原调用，不静默丢弃 values', () => {
      const code =
        `import { useTranslation } from 'react-i18next';\n` +
        `export function C({ count }: { count: number }) {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <div>{t('k', { count })}</div>;\n` +
        `}\n`;
      const out = restore(code, { k: '没有占位符的文案' });
      expect(out, `还原输出：\n${out}`).toContain(`t('k', { count })`);
      expect(out).toContain('useTranslation');
    });

    it('回归：无 values 时 0 占位符文案仍正常还原为字符串', () => {
      const code =
        `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <div title={t('k')} />;\n` +
        `}\n`;
      const out = restore(code, { k: '普通文案' });
      expect(out, `还原输出：\n${out}`).toContain('"普通文案"');
    });
  });
});

/**
 * 组件把 t 绑在形参解构上（手写 HOC 的常见形态）时，restore 若剥 heritage / 解包 HOC
 * 而形参 { t } 仍在，t 就成了 Props 上不存在的属性（TS2339）。此类组件整组保守保留。
 */
describe('React restore — 形参解构绑定 t 的组件整组保守保留', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-param-hoc-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('手写 HOC + 形参解构：不剥 heritage、不解包 HOC、不删导入，文案照常还原', () => {
    const source = `import React from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
  x: number;
}

function Inner({ t, x }: Props) {
  return <div>{t('k0')}{x}</div>;
}

export default withTranslation()(Inner);
`;
    const file = path.join(dir, 'Inner.tsx');
    fs.writeFileSync(file, source);
    const library = createReactI18nLibrary('react-i18next');
    const restored = new ReactRestoreTransformer(library, '@/plugins/locale').transform(
      file,
      { k0: '你好' },
      source,
    );

    // 文案本身照常还原
    expect(restored).toContain('你好');
    // 剥 heritage + 解包 HOC 而形参 { t, x } 仍在 → t 是 Props 上不存在的属性（TS2339）
    expect(restored).toMatch(/interface\s+Props\s+extends\s+WithTranslation/);
    expect(restored).toContain('withTranslation()(Inner)');
    expect(restored).toContain("from 'react-i18next'");
    expect(restored).toMatch(/function\s+Inner\(\{\s*t,\s*x\s*\}/);
  });

  it('反向：工具自产 HOC 注入的 roundtrip 仍完整还原（守卫不误伤）', async () => {
    const original = `import React from 'react';
export class Greeting extends React.Component {
  render() {
    return <div title="你好">x</div>;
  }
}
`;
    const file = path.join(dir, 'G.tsx');
    fs.writeFileSync(file, original);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-intl');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s: ExtractedString, i) => (s.semanticId = `k${i}`));
    const injected = adapter.getTransformer().transform(file, strings, original);
    const locale: Record<string, string> = {};
    strings.forEach((s) => (locale[s.semanticId] = s.processedMessage || s.original));

    // 前置确认：确实走了 HOC 注入路径
    expect(injected).toContain('injectIntl(GreetingWithOutIntl)');

    const library = createReactI18nLibrary('react-intl');
    const restored = new ReactRestoreTransformer(library, '@/plugins/locale').transform(
      file,
      locale,
      injected,
    );

    expect(restored).not.toContain('injectIntl');
    expect(restored).not.toContain('WithOutIntl');
    expect(restored).not.toContain('WrappedComponentProps');
    expect(restored).toContain('你好');
    expect(restored).toMatch(/export\s+class\s+Greeting\b/);
  });

  it('反向：普通 hook 注入的函数组件 roundtrip 仍完整清理（守卫不误伤）', async () => {
    const original = `import React from 'react';
export function Hello() {
  return <div title="欢迎">x</div>;
}
`;
    const file = path.join(dir, 'H.tsx');
    fs.writeFileSync(file, original);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s: ExtractedString, i) => (s.semanticId = `k${i}`));
    const injected = adapter.getTransformer().transform(file, strings, original);
    const locale: Record<string, string> = {};
    strings.forEach((s) => (locale[s.semanticId] = s.processedMessage || s.original));

    const library = createReactI18nLibrary('react-i18next');
    const restored = new ReactRestoreTransformer(library, '@/plugins/locale').transform(
      file,
      locale,
      injected,
    );

    expect(restored).not.toContain('useTranslation');
    expect(restored).toContain('欢迎');
  });
});

/**
 * locale 值里的字面花括号无法与占位符区分时，restore 保守保留原调用，
 * 并打一条含两侧占位符集合的可操作告警（每个 key 只打一遍）。
 */
describe('React restore — 占位符失配告警', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-p2-react-warn-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('字面花括号导致失配：保留原调用，告警恰好一次且含两侧占位符集合', () => {
    const source = `import React from 'react';
import { useTranslation } from 'react-i18next';
export const App = ({ n }: { n: number }) => {
  const { t } = useTranslation();
  return <div>{t('k0', { n })}</div>;
};
`;
    const file = path.join(dir, 'Warn.tsx');
    fs.writeFileSync(file, source);
    const warn = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});

    const restored = new ReactRestoreTransformer(
      createReactI18nLibrary('react-i18next'),
      '@/plugins/locale',
    ).transform(file, { k0: '共{{n}}项，速查表见{说明}' }, source);

    // 无法区分字面花括号与占位符 → 保守保留原调用与其声明 / 导入
    expect(restored).toContain("t('k0', { n })");
    expect(restored).toContain('useTranslation');

    const messages = warn.mock.calls
      .map((call) => String(call[0]))
      .filter((m) => m.includes('[Restore Warning]'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('k0');
    expect(messages[0]).toContain('共{n}项，速查表见{说明}');
    expect(messages[0]).toContain('n、说明');
    expect(messages[0]).toContain('字面花括号');
  });

  it('反向：占位符与 values 对齐时照常还原且零告警', () => {
    const source = `import React from 'react';
import { useTranslation } from 'react-i18next';
export const App = ({ n }: { n: number }) => {
  const { t } = useTranslation();
  return <div>{t('k0', { n })}</div>;
};
`;
    const file = path.join(dir, 'Ok.tsx');
    fs.writeFileSync(file, source);
    const warn = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});

    const restored = new ReactRestoreTransformer(
      createReactI18nLibrary('react-i18next'),
      '@/plugins/locale',
    ).transform(file, { k0: '共{{n}}项' }, source);

    expect(restored).toContain('共${n}项');
    expect(restored).not.toContain('useTranslation');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('[Restore Warning]'))).toEqual([]);
  });
});
