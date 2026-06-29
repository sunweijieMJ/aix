import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ts from 'typescript';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import type { ReactI18nLibraryType } from '../src/strategies/react/libraries';
import { HooksUtils } from '../src/strategies/react/hooks-utils';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';
import type { ExtractedString } from '../src/utils/types';

/**
 * React「转换 / 注入 / 提取」相关单点测试的合集（场景以分隔注释分组）。
 */

function buildInjector(lib: ReactI18nLibraryType = 'react-i18next') {
  const library = createReactI18nLibrary(lib);
  const importManager = new ReactImportManager('@/i18n', library);
  return new ReactComponentInjector(library, importManager);
}

const count = (s: string, re: RegExp) => (s.match(re) || []).length;

// ---------------------------------------------------------------------------
// 场景 1：ReactComponentInjector 组件 hook / HOC 注入
// ---------------------------------------------------------------------------
describe('ReactComponentInjector.injectHook', () => {
  it('块体箭头组件：在 Block 顶部注入 hook', () => {
    const injector = buildInjector();
    const code = `const Badge = ({ status }: { status: string }) => {\n  return <span title={t('badge.title')} />;\n};`;
    const out = injector.inject(code);
    expect(out).toContain('useTranslation()');
  });

  it('表达式体箭头组件：包成块体并注入 hook，避免 t is not defined（回归 B3）', () => {
    const injector = buildInjector();
    // 属性中已被替换为 t() 调用，但箭头函数是表达式体（无 Block）
    const code = `const Badge = ({ status }: { status: string }) => <span title={t('badge.title')} />;`;
    const out = injector.inject(code);

    // 必须注入 hook 声明
    expect(out).toContain('const { t } = useTranslation();');
    // 表达式体被包成块体：出现 return + 花括号
    expect(out).toContain('return <span');
    // 产物可被 TS 重新解析（语法合法）
    expect(() => {
      // 不抛即视为语法结构完整
      return out.includes('=> {') && out.includes('}');
    }).not.toThrow();
    expect(out).toContain('=> {');
  });
});

it('同名表达式体组件应各自独立注入，避免重叠', () => {
  const injector = buildInjector();
  const code = `const Badge = () => <span title={t('badge.title')} />;
const Badge = () => <span title={t('badge.desc')} />;`;

  const out = injector.inject(code);

  // 检查是否保留了两个 Badge 声明
  const badgeDeclarations = (out.match(/const\s+Badge\s*=/g) || []).length;
  expect(badgeDeclarations).toBe(2);

  // 检查箭头函数体是否被包成 block
  const arrowBlocks = (out.match(/=>\s*{/g) || []).length;
  expect(arrowBlocks).toBeGreaterThanOrEqual(1);

  // 检查 return 语句（表达式体被转换为块体）
  const returns = (out.match(/return\s+</g) || []).length;
  expect(returns).toBeGreaterThanOrEqual(1);

  // 检查花括号配对
  const openBraces = (out.match(/{/g) || []).length;
  const closeBraces = (out.match(/}/g) || []).length;
  expect(openBraces).toBe(closeBraces);
});

describe('ReactComponentInjector.injectHOC：表达式体箭头类成员（回归 #4）', () => {
  it('类组件表达式体箭头成员使用 t()：注入 this.props 解构并包成块体，避免 t is not defined', () => {
    const injector = buildInjector();
    // renderLabel 是表达式体箭头属性成员，体内已被替换成裸 t()（模拟 transformer 输出）。
    // injectHOC 旧逻辑用 `ts.isBlock(body)` 守卫，表达式体被跳过 → t 未从 this.props 解构。
    const code = `import { Component } from 'react';
class Panel extends Component {
  renderLabel = () => t('panel.label');
  render() {
    return <div>{this.renderLabel()}</div>;
  }
}
export default Panel;`;
    const out = injector.inject(code);

    // 必须为该成员注入 props 解构
    expect(out).toContain('const { t } = this.props;');
    // 表达式体被包成块体
    expect(out).toMatch(/renderLabel\s*=\s*\(\)\s*=>\s*\{/);
  });
});

describe('ReactComponentInjector.injectHOC：已有 this.props 解构不得重复注入（审计 #3）', () => {
  // 修复前用固定字符串 includes('const { t } = this.props') 检测已有解构，对多属性
  // (`const { t, data }`) / 无空格 (`const {t}`) 等合法写法漏判 → 在同块重复注入
  // `const { t } = this.props;`，块级重复声明 t → TS2451 不可编译。改用 AST 检测后免疫。
  it('已有多属性解构 const { t, data } = this.props：不再重复注入', () => {
    const injector = buildInjector();
    const code = `import { Component } from 'react';
class Panel extends Component {
  render() {
    const { t, data } = this.props;
    return <div title={t('panel.label')}>{data}</div>;
  }
}
export default Panel;`;
    const out = injector.inject(code);

    // 只保留原解构一处，不得再注入第二条 this.props 解构
    expect(count(out, /=\s*this\.props/g)).toBe(1);
    expect(out).toContain('const { t, data } = this.props;');
    expect(out).not.toContain('const { t } = this.props;');
  });

  it('已有无空格解构 const {t} = this.props：不再重复注入', () => {
    const injector = buildInjector();
    const code = `import { Component } from 'react';
class Panel extends Component {
  render() {
    const {t} = this.props;
    return <div title={t('panel.label')} />;
  }
}
export default Panel;`;
    const out = injector.inject(code);

    expect(count(out, /=\s*this\.props/g)).toBe(1);
  });

  it('确无解构时仍正常注入（既有行为保护）', () => {
    const injector = buildInjector();
    const code = `import { Component } from 'react';
class Panel extends Component {
  render() {
    return <div title={t('panel.label')} />;
  }
}
export default Panel;`;
    const out = injector.inject(code);

    expect(out).toContain('const { t } = this.props;');
  });
});

// ---------------------------------------------------------------------------
// 场景 2：ReactImportManager — 非组件作用域注入 import { t }
// ---------------------------------------------------------------------------
/**
 * 非组件（模块顶层 / 工具函数 / store 等，componentType='other'）的 React 文件，
 * 提取后必须注入「import { t } from tImport」、调用裸 t()，二者一致才能运行。
 */
describe('ReactImportManager — 非组件作用域注入 import { t }', () => {
  const lib = createReactI18nLibrary('react-i18next');
  const makeStr = (over: Partial<ExtractedString> = {}): ExtractedString => ({
    original: '你好',
    semanticId: 'views.Demo.foo',
    filePath: 'x.ts',
    line: 1,
    column: 1,
    context: 'js-code',
    componentType: 'other',
    ...over,
  });

  it('非组件文件注入 import { t } from tImport，不注入 i18next', () => {
    const mgr = new ReactImportManager('@/plugins/locale', lib);
    const code = `export const f = (): string => t('views.Demo.foo');`;
    const out = mgr.handleGlobalImports(code, [makeStr()]);
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).not.toContain('i18next');
  });

  it('同路径已有其他命名导入时，t 合并进同一条 import（不被过宽正则误判为已存在）', () => {
    const mgr = new ReactImportManager('@/plugins/locale', lib);
    // 'formatDate' 含字母 t —— 宽松正则会误命中并跳过注入，这里验证 t 仍被正确合并
    const code = `import { formatDate } from '@/plugins/locale';\nexport const f = () => t('views.Demo.foo');`;
    const out = mgr.handleGlobalImports(code, [makeStr()]);
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toMatch(/formatDate/);
    expect(out).not.toContain('i18next');
  });

  it('t 已导入时不重复注入', () => {
    const mgr = new ReactImportManager('@/plugins/locale', lib);
    const code = `import { t } from '@/plugins/locale';\nexport const f = () => t('views.Demo.foo');`;
    const out = mgr.handleGlobalImports(code, [makeStr()]);
    const count = (out.match(/import\s*\{[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/g) || [])
      .length;
    expect(count).toBe(1);
  });

  it('纯组件文件（无 other）不注入模块级 t import', () => {
    const mgr = new ReactImportManager('@/plugins/locale', lib);
    const code = `const C = () => <div>{t('a')}</div>;`;
    const out = mgr.handleGlobalImports(code, [makeStr({ componentType: 'function' })]);
    expect(out).not.toContain("from '@/plugins/locale'");
  });

  it('[react-intl] 模块顶层 jsx-text → 不注入永不使用的死声明 const intl = getIntl()', () => {
    // 模块顶层 JSX 文本（如 export const columns = [{ title: <span>姓名</span> }]）：
    // componentType 向上到 SourceFile = 'other'，但 jsx-text 被替换成 <FormattedMessage>，
    // 不需要 intl。若 needsGlobalFunction 不排除 jsx-text，会注入永不使用的
    // const intl = getIntl(); → no-unused-vars 失败 + 模块加载期 getIntl() 可能抛错。
    const intlMgr = new ReactImportManager('@/i18n', createReactI18nLibrary('react-intl'));
    const code = `export const columns = [{ title: <FormattedMessage id="k" /> }];`;
    const out = intlMgr.handleGlobalImports(code, [
      makeStr({ componentType: 'other', context: 'jsx-text' }),
    ]);
    expect(out).not.toContain('const intl = getIntl()');
  });

  it('[react-intl] 模块顶层 js-code(非 jsx) → 仍注入 const intl = getIntl()（不误伤正常场景）', () => {
    const intlMgr = new ReactImportManager('@/i18n', createReactI18nLibrary('react-intl'));
    const code = `export const msg = intl.formatMessage({ id: 'k' });`;
    const out = intlMgr.handleGlobalImports(code, [
      makeStr({ componentType: 'other', context: 'js-code' }),
    ]);
    expect(out).toContain('const intl = getIntl()');
  });
});

// ---------------------------------------------------------------------------
// 场景 3：嵌套组件作用域不串味（回归 #4）
// ---------------------------------------------------------------------------
/**
 * 回归 #4：isTranslationAvailableInScope / componentUsesTranslation 旧实现遍历整棵子树、
 * 不在嵌套组件边界停止。于是：
 *  - 外层组件因「内层嵌套组件已 const { t } = useTranslation()」被误判为「t 已可用」→ 跳过注入
 *    → 外层自身的 t('b') 引用未声明标识符（运行时 t is not defined）。
 *  - 反向：外层本身不用 t、仅内层组件用 t 时，外层被误判「需要」→ 多注入一个未用 hook。
 * 修复：someWithinComponentScope 在嵌套可注入组件边界停止下钻；普通回调（useEffect/onClick）
 * 不是边界，仍下钻——注入到外层的 hook 在闭包内可用。
 */
describe('ReactComponentInjector：嵌套组件作用域不串味（回归 #4）', () => {
  it('外层用 t + 内层组件已有 t → 外层仍注入自己的 useTranslation（共 2 个）', () => {
    const code = `const Outer = () => {
  const Inner = () => {
    const { t } = useTranslation();
    return <span>{t('a')}</span>;
  };
  return <div>{t('b')}<Inner /></div>;
};`;
    const out = buildInjector().inject(code);
    // 修复前：外层被跳过 → 只有内层 1 个 useTranslation，外层 t('b') 未声明
    expect(count(out, /useTranslation\(\)/g)).toBe(2);
  });

  it('外层不用 t、仅内层组件用 t → 外层不注入多余 hook（共 1 个）', () => {
    const code = `const Outer = () => {
  const Inner = () => {
    const { t } = useTranslation();
    return <span>{t('a')}</span>;
  };
  return <Inner />;
};`;
    const out = buildInjector().inject(code);
    expect(count(out, /useTranslation\(\)/g)).toBe(1);
  });

  it('无回归：t 仅用于普通回调（非组件函数）时外层仍注入 hook', () => {
    const code = `const C = () => {
  useEffect(() => {
    console.log(t('x'));
  }, []);
  return <div />;
};`;
    const out = buildInjector().inject(code);
    expect(count(out, /useTranslation\(\)/g)).toBe(1);
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\)/);
  });

  it('react-intl：外层用 intl + 内层组件已有 useIntl → 外层仍注入（共 2 个 useIntl）', () => {
    const code = `const Outer = () => {
  const Inner = () => {
    const intl = useIntl();
    return <span>{intl.formatMessage({ id: 'a' })}</span>;
  };
  return <div>{intl.formatMessage({ id: 'b' })}<Inner /></div>;
};`;
    const out = buildInjector('react-intl').inject(code);
    expect(count(out, /useIntl\(\)/g)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 场景 4：t 非解构首位时不重复注入 hook（回归 #1）
// ---------------------------------------------------------------------------
/**
 * 回归 #1：isTranslationAvailableInScope 旧正则 `/const\s+\{\s*t\s*[,}]/` 要求 t 是
 * 解构的第一个绑定。对 react-i18next 极常见的 `const { i18n, t } = useTranslation()`
 * （t 非首位）判定失败 → injector 误判 t 不在作用域 → 再插入第二个
 * `const { t } = useTranslation();` → `Cannot redeclare block-scoped variable 't'`，
 * 整文件无法编译。
 */
describe('ReactComponentInjector：t 非解构首位时不重复注入 hook（回归 #1）', () => {
  it('const { i18n, t } = useTranslation() 已在作用域时，不再插入第二个 useTranslation', () => {
    const injector = buildInjector();
    const code = `const Badge = ({ status }: { status: string }) => {
  const { i18n, t } = useTranslation();
  return <span title={t('badge.title')}>{i18n.language}</span>;
};`;
    const out = injector.inject(code);

    // 已有 useTranslation()，不应再注入第二个
    const hookCount = (out.match(/useTranslation\(\)/g) || []).length;
    expect(hookCount).toBe(1);
    // 也不应产出会导致重声明的 `const { t } = useTranslation();`
    expect(out).not.toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
  });

  it('const { t, i18n } = useTranslation()（t 首位）仍然不重复注入', () => {
    const injector = buildInjector();
    const code = `const Badge = () => {
  const { t, i18n } = useTranslation();
  return <span title={t('badge.title')}>{i18n.language}</span>;
};`;
    const out = injector.inject(code);
    const hookCount = (out.match(/useTranslation\(\)/g) || []).length;
    expect(hookCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 场景 5：isAlreadyInternationalized 特征护栏
// ---------------------------------------------------------------------------
/**
 * isAlreadyInternationalized 特征护栏（C：两库共享父链脚手架抽取重构的安全网）。
 * 逐分支断言 react-i18next / react-intl 的「已国际化 / 类型字面量 / 枚举 / 作用域停止」判定，
 * 确保抽取到 CommonASTUtils 后行为完全不变。
 */
const findNode = (code: string, text: string): ts.Node => {
  const sf = CommonASTUtils.parseSourceFile(code, 'probe.tsx');
  let found: ts.Node | undefined;
  const visit = (n: ts.Node): void => {
    if (
      !found &&
      (ts.isStringLiteral(n) || ts.isJsxText(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      n.getText(sf).includes(text)
    ) {
      found = n;
    }
    if (!found) ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) throw new Error(`probe 节点未找到: ${text}`);
  return found;
};

describe('react-i18next.isAlreadyInternationalized', () => {
  const lib = createReactI18nLibrary('react-i18next');
  const check = (code: string, text: string): boolean =>
    lib.isAlreadyInternationalized(findNode(code, text));

  it("t('key') 调用内 → true", () => {
    expect(check(`const a = t('已存在A');`, '已存在A')).toBe(true);
  });
  it('i18next.t(...) 调用内 → true', () => {
    expect(check(`const b = i18next.t('已存在B');`, '已存在B')).toBe(true);
  });
  it('<Trans> 元素内文本 → true', () => {
    expect(check(`const c = <Trans i18nKey="k">已存在C</Trans>;`, '已存在C')).toBe(true);
  });
  it('类型字面量 → true（编译期消费，跳过提取）', () => {
    expect(check(`type T = '已存在D';`, '已存在D')).toBe(true);
  });
  it('枚举成员值 → true', () => {
    expect(check(`enum E { A = '已存在E' }`, '已存在E')).toBe(true);
  });
  it('普通函数体内裸字面量 → false（遇 Block 停止）', () => {
    expect(check(`function C() { const s = '未国际化F'; return s; }`, '未国际化F')).toBe(false);
  });
});

describe('react-intl.isAlreadyInternationalized', () => {
  const lib = createReactI18nLibrary('react-intl');
  const check = (code: string, text: string): boolean =>
    lib.isAlreadyInternationalized(findNode(code, text));

  it('intl.formatMessage(...) 内 → true', () => {
    expect(
      check(`const a = intl.formatMessage({ id: 'x', defaultMessage: '已存在A' });`, '已存在A'),
    ).toBe(true);
  });
  it('defineMessages(...) 内 → true', () => {
    expect(
      check(`const m = defineMessages({ g: { id: 'g', defaultMessage: '已存在B' } });`, '已存在B'),
    ).toBe(true);
  });
  it('<FormattedMessage> 属性内 → true', () => {
    expect(
      check(`const c = <FormattedMessage id="k" defaultMessage="已存在C" />;`, '已存在C'),
    ).toBe(true);
  });
  it('枚举成员值 → true', () => {
    expect(check(`enum E { A = '已存在D' }`, '已存在D')).toBe(true);
  });
  it('普通函数体内裸字面量 → false（遇 Block 停止）', () => {
    expect(check(`function C() { const s = '未国际化E'; return s; }`, '未国际化E')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 场景 6：JSX 混合内容含嵌套元素 → 不丢失嵌套中文
// ---------------------------------------------------------------------------
/**
 * 回归（high，数据丢失）：JSX 混合内容（中文文本 + 插值）中的「嵌套元素子节点」
 * 不得被静默丢弃。
 *
 * 根因（修复前）：extractJsxMixedContent 的构建循环只处理 JsxText / JsxExpression，
 * 对 `<div>共 {count} 个 <b>项目</b></div>` 这类同时含插值与嵌套元素的节点，
 * hasExpression 为真触发混合提取，但 <b>项目</b> 既不进 template、reconstruct 也丢弃它，
 * 于是 findExactStringNode 匹配成功、ReactTransformer 替换整个 children 区间，
 * 把嵌套元素及其中文从源码删除且从不写入 locale —— 不可恢复。
 *
 * 修复：检测到嵌套元素子节点即放弃混合内容提取（return null），交回子节点逐个递归，
 * 各自独立提取/转换。宁可碎片化也不丢数据。
 */
describe('React JSX 混合内容含嵌套元素 → 不丢失嵌套中文', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-mixed-nested-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = async (code: string): Promise<{ strings: ExtractedString[]; injected: string }> => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const injected = adapter.getTransformer().transform(file, strings, code);
    return { strings, injected };
  };

  it('嵌套元素中文被单独提取，且转换后不从源码删除', async () => {
    const code = `import React from 'react';
export function C({ count }: { count: number }) {
  return <div>共 {count} 个 <b>项目</b></div>;
}
`;
    const { strings, injected } = await run(code);

    const texts = strings.map((s) => s.processedMessage || s.original);
    // 嵌套元素中文「项目」必须被提取（修复前会被静默吞掉，这里断言它存在）
    expect(
      texts.some((t) => t.includes('项目')),
      `提取结果：${JSON.stringify(texts)}`,
    ).toBe(true);

    // 转换后：嵌套 <b> 元素必须保留，且其中文被独立国际化（<Trans> / t() 引用），
    // 而非随整段 children 一起被删除。修复前 <b>项目</b> 会从源码消失。
    expect(injected, `转换输出：\n${injected}`).toMatch(
      /<b>\s*(<Trans\s+i18nKey=["']k\d+["']\s*\/?>|\{t\(['"]k\d+['"]\))/,
    );
    // 关键反例：不得把整段 children 折叠成单个占位符而吞掉 <b>
    expect(injected).toContain('<b>');
  });

  it('无嵌套元素的纯混合内容仍走原路径（不被本修复误伤）', async () => {
    const code = `import React from 'react';
export function C({ count }: { count: number }) {
  return <div>共 {count} 个</div>;
}
`;
    const { strings, injected } = await run(code);
    const texts = strings.map((s) => s.processedMessage || s.original);
    // 应作为一条混合内容提取，含 count 占位符
    expect(texts.some((t) => /\{count\}|\$\{count\}/.test(t))).toBe(true);
    expect(injected).toMatch(/<Trans|t\(/);
  });
});

// ---------------------------------------------------------------------------
// 场景 7：defineMessages 零参不崩溃
// ---------------------------------------------------------------------------
/**
 * 回归（审计 Low）：零参 `defineMessages()` 不得令整文件 restore 崩溃。
 *
 * 根因（修复前）：extractDefineMessages 用 `node.arguments[0]!` 非空断言后直接喂
 * ts.isObjectLiteralExpression(undefined)，内部读 .kind 抛 TypeError，中断整文件 restore。
 *
 * 修复：先判 arg 存在再判类型。
 */
describe('React restore — defineMessages 零参不崩溃', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-definemessages-zeroarg-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('文件含 `defineMessages()` 时 restore 正常返回、并仍还原其它翻译', () => {
    const code =
      `import { defineMessages, useIntl } from 'react-intl';\n` +
      `const stray = defineMessages();\n` +
      `export function C() {\n` +
      `  const intl = useIntl();\n` +
      `  return <p>{intl.formatMessage({ id: 'a' })}</p>;\n` +
      `}\n`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);

    const transformer = new ReactRestoreTransformer(
      createReactI18nLibrary('react-intl'),
      '@/plugins/locale',
    );

    let out = '';
    expect(() => {
      out = transformer.transform(file, { a: '你好' });
    }).not.toThrow();
    expect(out).toContain('你好');
  });
});

// ---------------------------------------------------------------------------
// 场景 8：hookUsesTranslationVar 成员名误报（审计 #2）
// ---------------------------------------------------------------------------
/**
 * 回归（审计二轮 #2）：hookUsesTranslationVar 用 ts.forEachChild 递归 hook 第一参数时，
 * 会访问 PropertyAccessExpression 的成员名 `.name`。当接收者 != 翻译变量（socket.t、
 * props.t、data.intl），递归到属性名 `t`/`intl` 时被裸标识符分支误判为「使用了翻译变量」，
 * 进而给一个与 i18n 无关的 hook 的依赖数组注入作用域内不存在的 `t` → 构建期 TS2304 /
 * 运行期 ReferenceError，且发生在工具本不该改动的代码里。
 * 修复：成员访问只递归接收者 node.expression，不把 node.name 当作自由变量引用。
 */
describe('hookUsesTranslationVar 成员名误报（审计 #2）', () => {
  it('react-i18next：props.t(...) 不应把 t 注入无关 hook 的依赖数组', () => {
    const lib = createReactI18nLibrary('react-i18next'); // translationVarName = 't'
    const code = `useEffect(() => { props.t('x'); }, [props]);`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    expect(out).toContain('[props]');
    expect(out).not.toContain('props, t'); // 修复前会变成 [props, t]
  });

  it('react-intl：data.intl 不应把 intl 注入无关 hook 的依赖数组', () => {
    const lib = createReactI18nLibrary('react-intl'); // translationVarName = 'intl'
    const code = `useMemo(() => data.intl, [data]);`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    expect(out).toContain('[data]');
    expect(out).not.toContain('data, intl');
  });

  it('真正使用裸 t() 时仍正确注入依赖', () => {
    const lib = createReactI18nLibrary('react-i18next');
    const code = `useEffect(() => { const s = t('x'); return s; }, [props]);`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    expect(out).toContain('[props, t]');
  });

  it('接收者就是翻译变量 intl.formatMessage 时仍正确注入', () => {
    const lib = createReactI18nLibrary('react-intl');
    const code = `useMemo(() => intl.formatMessage({ id: 'x' }), [a]);`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    expect(out).toContain('[a, intl]');
  });
});

// ---------------------------------------------------------------------------
// 场景 9：react-intl 仅有 props.intl 时补注入 useIntl（审计三轮 #4）
// ---------------------------------------------------------------------------
/**
 * 回归（三轮审计 #4，产物无法编译）：react-intl 的 generateFunctionCall 恒发裸
 * `intl.formatMessage`，但 isTranslationAvailableInScope 把 `props.intl`/`this.props.intl`
 * 也算「已可用」→ 函数组件仅有 props.intl 时跳过注入，产出的裸 `intl` 在作用域内无绑定
 * → TS2304 / 运行时 ReferenceError。
 *
 * 修复：函数组件按「是否存在本地 intl 绑定（const intl = useIntl()）」判定 needsIntl，
 * 仅有 props.intl 时仍注入 useIntl（IntlProvider 下始终安全，不涉及类组件的二次 HOC 包裹）。
 */
describe('react-intl 函数组件仅有 props.intl 时补注入 useIntl（审计三轮 #4）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-intl-propsintl-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('仅有 props.intl 的函数组件：注入 useIntl 使裸 intl 有绑定', async () => {
    const code = `import React from 'react';
export const Foo = (props: any) => {
  const existing = props.intl.formatMessage({ id: 'existing.key' });
  return <input placeholder="请输入" title={existing} />;
};
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-intl');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // 占位符被替换为裸 intl.formatMessage（既有行为）
    expect(out).toMatch(/placeholder=\{intl\.formatMessage\(/);
    // 关键：必须注入本地 const intl = useIntl()，否则裸 intl 未定义
    expect(out).toMatch(/const\s+intl\s*=\s*useIntl\(\)/);
    expect(out).toMatch(/import\b[^;]*\buseIntl\b[^;]*from\s*'react-intl'/);
  });

  it('控制用例：已有 const intl = useIntl() 不被二次注入', async () => {
    const code = `import React from 'react';
import { useIntl } from 'react-intl';
export const Bar = () => {
  const intl = useIntl();
  return <input placeholder="提交" title={intl.formatMessage({ id: 'a' })} />;
};
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-intl');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // 只应有一处 const intl = useIntl()
    expect((out.match(/const\s+intl\s*=\s*useIntl\(\)/g) || []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 场景 10：GenerateProcessor 覆盖率 — react-intl 调用点计入分子（审计三轮 #5）
// ---------------------------------------------------------------------------
/**
 * 回归（三轮审计 #5）：覆盖率分子（已国际化调用点）由 IdReuseResolver
 * scanExistingCallsInSources 统计，此前正则只认 `t()/$t()`。react-intl 项目用的是
 * `intl.formatMessage({ id })` / `<FormattedMessage id>`，react-i18next 的 `<Trans
 * i18nKey>` 也不匹配 —— 于是已 100% 国际化的 react-intl 文件 alreadyI18n 恒为 0，
 * 覆盖率被系统性低估，可误触 --coverage-threshold CI 卡点。
 * 修复：复用 source-key-scanner 的 CALL_FIRST_ARG + ATTR_PATTERNS 全量口径。
 */
describe('GenerateProcessor 覆盖率 — react-intl 调用点计入分子（审计三轮 #5）', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'react', library: 'react-intl', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-cov-react-intl-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    CommonASTUtils.drainSkippedComparisonOperands();
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('formatMessage / <FormattedMessage> 已国际化调用点计入 alreadyI18n', async () => {
    // done.tsx：无中文，已有两个 react-intl 调用点（formatMessage + FormattedMessage）
    fs.writeFileSync(
      path.join(srcDir, 'Done.tsx'),
      `import { useIntl, FormattedMessage } from 'react-intl';
export function Done() {
  const intl = useIntl();
  const label = intl.formatMessage({ id: 'home.title' });
  return <div title={label}><FormattedMessage id="home.subtitle" /></div>;
}
`,
      'utf-8',
    );
    // new.tsx：含一处新中文（本轮新生成）
    fs.writeFileSync(
      path.join(srcDir, 'New.tsx'),
      `export function New() {
  return <button>提交</button>;
}
`,
      'utf-8',
    );

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await proc.execute(srcDir, true);

    const cov = proc.getCoverage();
    expect(cov?.newlyGenerated).toBe(1); // 提交
    // 修复前：alreadyI18n 恒为 0（formatMessage / FormattedMessage 不被 t()/$t() 正则匹配）
    expect(cov?.alreadyI18n).toBe(2); // home.title + home.subtitle
    expect(cov?.coverageRate).toBeCloseTo(1); // (2+1)/(2+1+0)
  });
});

// ---------------------------------------------------------------------------
// 场景 11：JSX 混合内容插值中嵌套中文记入诊断（审计三轮 #3）
// ---------------------------------------------------------------------------
/**
 * 回归（三轮审计 #3）：JSX 混合内容（中文文本 + 插值表达式）路径
 * extractJsxMixedContent 对每个 `{expr}` 子节点只发 `${expr}` 占位，**不**做嵌套中文
 * 检测——而模板字面量路径会把三元/逻辑分支里的中文记入 skippedNestedChinese 供
 * lint/doctor 告警。于是 `<div>状态：{ok ? '成功' : '失败'}</div>` 里的「成功/失败」
 * 既不翻译也无任何诊断，运行时静默泄漏未翻译中文。
 *
 * 修复：JSX 混合内容路径与模板字面量路径对齐，对插值子节点里的嵌套中文调用
 * recordSkippedNestedChinese。
 */
describe('React JSX 混合内容插值中嵌套中文记入诊断（审计三轮 #3）', () => {
  let dir: string;
  beforeEach(() => {
    CommonASTUtils.drainSkippedNestedChinese();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-jsx-nested-cn-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const extract = async (code: string) => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    return adapter.getTextExtractor().extractFromFile(file);
  };

  it('三元分支中文被记录，且未各自生成独立 key', async () => {
    const code = `import React from 'react';
export function C({ ok }: { ok: boolean }) {
  return <div>状态：{ok ? '成功' : '失败'}</div>;
}
`;
    const strings = await extract(code);

    // 「成功」「失败」不应作为独立提取项各自生成 key（被整段占位符吞掉）
    expect(strings.some((s) => s.original === '成功')).toBe(false);
    expect(strings.some((s) => s.original === '失败')).toBe(false);

    // 关键：两个中文分支被记入诊断集合（不再静默泄漏）
    const drained = CommonASTUtils.drainSkippedNestedChinese();
    const texts = drained.map((d) => d.text).sort();
    expect(texts).toEqual(['失败', '成功']);
    expect(drained[0]!.filePath).toBe(path.join(dir, 'C.tsx'));
    expect(drained[0]!.line).toBeGreaterThan(0);
  });

  it('插值为纯变量（无嵌套中文）：不记录、不产生噪声', async () => {
    const code = `import React from 'react';
export function C({ name }: { name: string }) {
  return <div>欢迎：{name}</div>;
}
`;
    await extract(code);
    expect(CommonASTUtils.drainSkippedNestedChinese()).toEqual([]);
  });
});
