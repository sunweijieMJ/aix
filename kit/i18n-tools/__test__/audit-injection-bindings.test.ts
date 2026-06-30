import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import {
  createReactI18nLibrary,
  type ReactI18nLibraryType,
} from '../src/strategies/react/libraries';
import { VueImportManager } from '../src/strategies/vue/VueImportManager';
import { VueComponentInjector } from '../src/strategies/vue/VueComponentInjector';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import type { ExtractedString } from '../src/utils/types';

/**
 * 多 agent 审计 + 交叉验证确认的 4 处「注入绑定缺口」回归测试。
 * 公共前提：ReactComponentInjector.inject 作用于「已被 transformer 替换出 t()/intl 调用」的代码，
 * 故用例直接传入含裸 t()/intl 的源码模拟注入阶段输入。
 */

function buildReactInjector(lib: ReactI18nLibraryType = 'react-i18next') {
  const library = createReactI18nLibrary(lib);
  return new ReactComponentInjector(library, new ReactImportManager('@/i18n', library));
}

/** 用 transpileModule 取语法（非语义）错误数：可捕获重复声明、孤立 default 等结构性错误。 */
function syntaxErrorCount(code: string): number {
  const result = ts.transpileModule(code, {
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest },
    fileName: 'c.tsx',
  });
  return (result.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error)
    .length;
}

// ---------------------------------------------------------------------------
// Bug 1：类组件 constructor / 访问器中的裸 t() 需补 this.props 解构
// ---------------------------------------------------------------------------
describe('React 类组件 constructor / 访问器注入（审计 Bug1）', () => {
  it('constructor 中 this.state = { x: t() } → 在 super() 之后注入 const { t } = this.props', () => {
    const code = `class Foo extends React.Component {
  constructor(props: {}) {
    super(props);
    this.state = { title: t('k.title') };
  }
  render() { return <div>{this.state.title}</div>; }
}`;
    const out = buildReactInjector().inject(code);
    expect(out).toContain('const { t } = this.props;');
    // 解构必须在 super() 之后，否则 this.props 尚未被父类赋值
    expect(out.indexOf('super(props)')).toBeLessThan(out.indexOf('const { t } = this.props;'));
    expect(out).toContain('withTranslation()(FooWithOutIntl)');
    expect(syntaxErrorCount(out)).toBe(0);
  });

  it('getter 中 return t() → 注入 const { t } = this.props', () => {
    const code = `class Bar extends React.Component {
  get label() { return t('k.label'); }
  render() { return <div>{this.label}</div>; }
}`;
    const out = buildReactInjector().inject(code);
    expect(out).toContain('const { t } = this.props;');
    expect(syntaxErrorCount(out)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bug 2：函数组件以解构形参接收 t/intl 时不得再注入 hook（否则同作用域双声明）
// ---------------------------------------------------------------------------
describe('React 函数组件解构形参绑定（审计 Bug2）', () => {
  it('react-i18next：({ t }: WithTranslation) 已绑定 t → 不注入 useTranslation', () => {
    const code = `const Foo = ({ t }: WithTranslation) => <input placeholder={t('k.ph')} />;`;
    const out = buildReactInjector('react-i18next').inject(code);
    expect(out).not.toContain('useTranslation()');
    expect(syntaxErrorCount(out)).toBe(0);
  });

  it('react-intl：({ intl }: WrappedComponentProps) 已绑定 intl → 不注入 useIntl', () => {
    const code = `const Foo = ({ intl }: WrappedComponentProps) => <input placeholder={intl.formatMessage({ id: 'k.ph' })} />;`;
    const out = buildReactInjector('react-intl').inject(code);
    expect(out).not.toContain('useIntl()');
    expect(syntaxErrorCount(out)).toBe(0);
  });

  it('回归保护：无形参绑定的普通函数组件仍注入 useTranslation', () => {
    const code = `const Foo = () => <input placeholder={t('k.ph')} />;`;
    const out = buildReactInjector('react-i18next').inject(code);
    expect(out).toContain('useTranslation()');
  });
});

// ---------------------------------------------------------------------------
// Bug 4：匿名 export default class 组件需命名并 HOC 包裹（此前产出裸 t() 无绑定）
// ---------------------------------------------------------------------------
describe('React 匿名默认导出类组件注入（审计 Bug4）', () => {
  it('export default class extends Component → 命名 + HOC 包裹 + this.props 解构', () => {
    const code = `export default class extends React.Component {
  render() { return <input placeholder={t('k.ph')} />; }
}`;
    const out = buildReactInjector().inject(code);
    expect(out).toContain('class DefaultExportedComponentWithOutIntl extends React.Component');
    expect(out).toContain('const { t } = this.props;');
    expect(out).toContain('export default withTranslation()(DefaultExportedComponentWithOutIntl)');
    // 不得残留孤立的 `export default class`（剥离不全会产出 `default class` 语法错误）
    expect(out).not.toMatch(/export\s+default\s+class\s+extends/);
    expect(syntaxErrorCount(out)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bug 3：Vue 具名 import 别名误判（import { t as X } 的本地名是 X，并非 t）
// ---------------------------------------------------------------------------
describe('Vue 具名 import 本地绑定名判定（审计 Bug3）', () => {
  const newMgr = () => new VueImportManager('@/i18n', new VueI18nLibraryImpl());
  const scriptString: ExtractedString = {
    original: '',
    semanticId: 'k',
    filePath: 'f.vue',
    line: 1,
    column: 1,
    context: 'script',
    componentType: 'setup',
  };

  it('import { t as translate }（本地无 t）→ 仍注入 import { t }，避免裸 t() 未声明', () => {
    const code = `<template><div>{{ t('x') }}</div></template>
<script setup>
import { t as translate } from '@/other';
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'f.vue');
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/i18n['"]/);
  });

  it('import { foo as t }（本地有 t）→ 不重复注入 import { t }', () => {
    const code = `<template><div>{{ t('x') }}</div></template>
<script setup>
import { foo as t } from '@/other';
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'f.vue');
    // 全文只应有那一条来自 '@/other' 的具名 t 导入，不得新增 '@/i18n' 的 t 导入
    expect(out).not.toContain("from '@/i18n'");
    expect((out.match(/import\s*\{[^}]*\bt\b[^}]*\}\s*from/g) ?? []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Bug（另窗口）：Vue <script setup> 裸 t() 应走模块 import，不回落 useI18n hook
// ---------------------------------------------------------------------------
describe('Vue script setup 裸 t() 统一走模块 import（审计 Bug-VueSetup）', () => {
  const build = () => {
    const mgr = new VueImportManager('@/plugins/locale', new VueI18nLibraryImpl());
    return new VueComponentInjector(new VueI18nLibraryImpl(), mgr);
  };

  it('中文仅在 template + setup 内有裸 t()（auto-import）→ 补 import { t }，不注入 useI18n hook', () => {
    const code = `<template>
  <div>{{ $t('k0') }}</div>
</template>
<script setup lang="ts">
const label = t('existing.key');
</script>`;
    const out = build().inject(code);
    expect(out).toContain("import { t } from '@/plugins/locale'");
    expect(out).not.toContain('useI18n');
  });

  it('回归保护：已有 import { t } 时不重复注入', () => {
    const code = `<template>
  <div>{{ $t('k0') }}</div>
</template>
<script setup lang="ts">
import { t } from '@/plugins/locale';
const label = t('existing.key');
</script>`;
    const out = build().inject(code);
    expect((out.match(/import\s*\{\s*t\s*\}\s*from/g) ?? []).length).toBe(1);
    expect(out).not.toContain('useI18n');
  });
});
