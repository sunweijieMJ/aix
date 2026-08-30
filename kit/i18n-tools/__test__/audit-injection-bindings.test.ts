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
import { VueI18nextLibrary } from '../src/strategies/vue/libraries/vue-i18next';
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

  // 回归（审计 medium，VueImportManager:267）：注释里的 import { t } 不剥离会被正则误判为
  // 「已有本地 t 导入」→ 漏注入真实 import → 裸 t() 运行时 ReferenceError。行首锚定后排除注释。
  it('注释里的 import { t } 不得误判为已有本地 t → 仍注入真实 import', () => {
    const code = `<template><div>{{ t('x') }}</div></template>
<script setup>
// import { t } from './old-locale';
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'f.vue');
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/i18n['"]/);
  });

  // 回归（审计 medium，VueImportManager:238）：注释里的 const { t } = useI18n() 同理不得误判。
  it('注释里的 const { t } = useI18n() 不得误判为已有 hook 绑定 → 仍注入真实 import', () => {
    const code = `<template><div>{{ t('x') }}</div></template>
<script setup>
// const { t } = useI18n();
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'f.vue');
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/i18n['"]/);
  });
});

// ---------------------------------------------------------------------------
// 审计 medium（vue-i18next:40）：hook 清理正则只匹配工具自注入形态，不误删用户手写含参 hook
// ---------------------------------------------------------------------------
describe('vue-i18next hook 清理正则只匹配工具注入形态（审计 medium）', () => {
  const re = () => new VueI18nextLibrary().getHookDeclarationCleanupRegex();

  it('清理工具注入的无参 / 单命名空间参数形态', () => {
    expect(`const { t } = useTranslation();`.replace(re(), '')).toBe('');
    expect(`const { t } = useTranslation('ns');`.replace(re(), '')).toBe('');
  });

  it('不误删含选项的用户手写 hook（嵌套括号），不残留被截断的 });', () => {
    const userHook = `const { t } = useTranslation('ns', { keyPrefix: pick('a') });`;
    // 旧实现 [^)]* 非括号平衡：只删到第一个 ) → 残留 ` });` 语法错误。收窄后整条保留。
    expect(userHook.replace(re(), '')).toBe(userHook);
  });

  it('不误删对象参数形态 useTranslation({ keyPrefix })', () => {
    const userHook = `const { t } = useTranslation({ keyPrefix: 'x' });`;
    expect(userHook.replace(re(), '')).toBe(userHook);
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

// ---------------------------------------------------------------------------
// Bug 5：文件内同名组件按 name+type 查表 → 已有 hook 的那个也被再注入（TS2451）
// ---------------------------------------------------------------------------
/**
 * Phase 1 收集组件、Phase 3 按 `name + type` 去表里找条目：文件内两个同名组件
 * （不同作用域的 `function Panel()`）会全部命中同一条目，已有 `const { t } = useTranslation()`
 * 的那个也被再注入一次 → 同块双声明。改为 Phase 3 就地重算注入判定：Phase 2 只在文件顶部
 * 增删 import、不改变任何组件内部绑定，重算与 Phase 1 逐个组件一一对应，且免疫偏移平移。
 */
describe('同名组件不串号注入（审计 Bug5）', () => {
  it('两个同名 Panel：只给缺绑定的那个注入 hook', () => {
    const code = `import React from 'react';
export function Outer() {
  function Panel() {
    const { t } = useTranslation();
    return <div>{t('a')}</div>;
  }
  return <Panel />;
}
export function Other() {
  function Panel() {
    return <div>{t('b')}</div>;
  }
  return <Panel />;
}
`;
    const out = buildReactInjector().inject(code);
    // 全文件恰好两处 `const { t } = useTranslation()`：原有的一处 + 新注入的一处
    expect(
      (out.match(/const \{ t \} = useTranslation\(\)/g) ?? []).length,
      `注入输出：\n${out}`,
    ).toBe(2);
    expect(syntaxErrorCount(out)).toBe(0);
  });

  it('两个同名类组件：已被 HOC 包裹的只补解构，未包裹的才加 wrapper', () => {
    const code = `import React from 'react';
export function A() {
  class Card extends React.Component<WithTranslation> {
    render() { const { t } = this.props; return <div>{t('a')}</div>; }
  }
  return <Card />;
}
export class Card extends React.Component {
  render() { return <div>{t('b')}</div>; }
}
`;
    const out = buildReactInjector().inject(code);
    // 未包裹的那个才生成 HOC wrapper，且只生成一次
    expect((out.match(/withTranslation\(\)\(/g) ?? []).length, `注入输出：\n${out}`).toBe(1);
    expect(syntaxErrorCount(out)).toBe(0);
  });

  it('回归：单个组件的常规注入不受影响', () => {
    const code = `import React from 'react';
export function Panel() {
  return <div>{t('a')}</div>;
}
`;
    const out = buildReactInjector().inject(code);
    expect((out.match(/const \{ t \} = useTranslation\(\)/g) ?? []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Bug 6：static 成员被注入 const { t } = this.props → 运行时 TypeError
// ---------------------------------------------------------------------------
/**
 * static 成员的 this 是类构造函数本身、没有 props。注入端遍历成员时不看 static 修饰符，
 * 会把 `const { t } = this.props` 塞进 static 方法/箭头属性体。提取端已整体跳过 static
 * 成员，这里是防御纵深：兜住用户手写、非本工具产出的 static 里的 t()。
 */
describe('static 类成员不注入 this.props 解构（审计 Bug6）', () => {
  it('static 方法内的 t()：不注入解构，实例方法照常注入', () => {
    const code = `class Foo extends React.Component {
  static build() { return t('x'); }
  render() { return <div>{t('y')}</div>; }
}
`;
    const out = buildReactInjector().inject(code);
    expect((out.match(/const \{ t \} = this\.props;/g) ?? []).length, `注入输出：\n${out}`).toBe(1);
    // 落点必须在 render 而非 static build
    expect(out.indexOf('const { t } = this.props;')).toBeGreaterThan(out.indexOf('static build'));
    expect(syntaxErrorCount(out)).toBe(0);
  });

  it('static 箭头属性内的 t()：不被包成块体注入解构', () => {
    const code = `class Foo extends React.Component {
  static build = () => t('x');
  render() { return <div />; }
}
`;
    const out = buildReactInjector().inject(code);
    expect(out, `注入输出：\n${out}`).not.toContain('const { t } = this.props;');
    expect(out).toContain('static build = () => t(');
  });
});
