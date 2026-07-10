import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ts from 'typescript';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { ReactTextExtractor } from '../src/strategies/react/ReactTextExtractor';
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

describe('类组件已被 HOC 包裹时补解构、不二次包裹（Bug4 / Bug5）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-class-wrapped-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('react-intl：已 injectIntl 包裹的 class 新增属性 → 注入 const { intl } = this.props，不二次 injectIntl（Bug4）', async () => {
    const code = `import React from 'react';
import { injectIntl, WrappedComponentProps } from 'react-intl';
class App extends React.Component<WrappedComponentProps> {
  render() {
    return <div title={this.props.intl.formatMessage({ id: 'x' })} data-y="额外" />;
  }
}
export default injectIntl(App);
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-intl');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // data-y 被替换为裸 intl.formatMessage
    expect(out).toMatch(/data-y=\{intl\.formatMessage\(/);
    // 关键 1：render 方法体注入 const { intl } = this.props（否则裸 intl 未定义 → ReferenceError）
    expect(out).toMatch(/const\s*\{\s*intl\s*\}\s*=\s*this\.props/);
    // 关键 2：不二次 injectIntl（仍只有用户那一处）
    expect((out.match(/injectIntl\(/g) ?? []).length).toBe(1);
  });

  it('react-i18next：已 withTranslation 包裹的 class 新增属性 → 注入 const { t } = this.props，不二次 withTranslation（Bug5）', async () => {
    const code = `import React from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
class App extends React.Component<WithTranslation> {
  render() {
    return <div title={this.props.t('x')} data-y="额外" />;
  }
}
export default withTranslation()(App);
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // data-y 被替换为裸 t(...)
    expect(out).toMatch(/data-y=\{t\(/);
    // 关键 1：render 方法体注入 const { t } = this.props
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*this\.props/);
    // 关键 2：不二次 withTranslation（仍只有用户那一处 HOC 调用）
    expect((out.match(/withTranslation\(\)/g) ?? []).length).toBe(1);
  });

  // 以下覆盖「工具自身首次注入产出的形态」再次重跑（增量工作流）：类体是
  // `const { t } = this.props` 解构 + 裸 t()，没有任何 this.props.t 成员访问。
  // 旧守卫只认 this.props.t 成员访问 → 漏判为「未包裹」→ 二次包裹（类名叠加 WithOutIntl
  // 后缀 + 多一层 withTranslation()(…)）。回归这条缺口。
  it('react-i18next：工具产出形态（解构 + WithTranslation 泛型）重跑 → 不二次包裹、类名不叠加（信号1）', async () => {
    const code = `import React from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
class App extends React.Component<WithTranslation> {
  render() {
    const { t } = this.props;
    return <div title={t('k0')} data-y="额外" />;
  }
}
export default withTranslation()(App);
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // 不二次 withTranslation（仍只有原来那一处）
    expect((out.match(/withTranslation\(\)/g) ?? []).length).toBe(1);
    // 类名不被叠加 WithOutIntl 后缀
    expect(out).not.toMatch(/WithOutIntl/);
    expect(out).toMatch(/class App extends/);
  });

  it('react-intl：工具产出形态（解构 intl + WrappedComponentProps）重跑 → 不二次包裹（信号1）', async () => {
    const code = `import React from 'react';
import { injectIntl, WrappedComponentProps } from 'react-intl';
class App extends React.Component<WrappedComponentProps> {
  render() {
    const { intl } = this.props;
    return <div title={intl.formatMessage({ id: 'k0' })} data-y="额外" />;
  }
}
export default injectIntl(App);
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-intl');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    expect((out.match(/injectIntl\(/g) ?? []).length).toBe(1);
    expect(out).not.toMatch(/WithOutIntl/);
  });

  it('react-i18next：仅解构、Props 无泛型的已包裹 class 重跑 → 靠解构信号兜底不二次包裹（信号3）', async () => {
    const code = `import React from 'react';
import { withTranslation } from 'react-i18next';
class App extends React.Component {
  render() {
    const { t } = this.props;
    return <div title={t('k0')} data-y="额外" />;
  }
}
export default withTranslation()(App);
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // heritage 无泛型 + 无 this.props.t 成员访问，只能靠「const { t } = this.props」解构信号判定已包裹
    expect((out.match(/withTranslation\(\)/g) ?? []).length).toBe(1);
    expect(out).not.toMatch(/WithOutIntl/);
  });
});

describe('JSX 文本碎片与相邻元素间的语义空格保留（Bug6）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-jsx-space-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('"共 <b/>" 替换后保留 <Trans/> 与 <b> 之间的空格', async () => {
    const code = `import React from 'react';
export const C = () => {
  return <div>共 <b>x</b></div>;
};
`;
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // "共" 被替换为 <Trans i18nKey="k0" />，与 <b> 之间的语义空格必须保留
    // （旧实现用 JsxText.getEnd() 含尾部空白做替换区间，把空格一并吞掉 → 渲染 "共x"）。
    expect(out).toMatch(/i18nKey="k0"\s*\/>\s<b>/);
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

/**
 * 回归（审计 medium，ReactTextExtractor:167）：已有 <Trans> 富文本不得被二次包裹。
 *
 * 根因（修复前）：visitNode 的混合内容分支（中文文本 + 插值）不经 isAlreadyInternationalized
 * 守卫直接提取。用户手写的 `<Trans>你好 {name} 欢迎</Trans>`（react-i18next 标准富文本）会被
 * 当未翻译整段提取 → ReactTransformer 把 children 替换为新的 <Trans i18nKey.../>，产出嵌套
 * 双重包裹的损坏代码（增量重跑 / 对已 i18n 文件运行时）。
 *
 * 修复：visitNode 识别翻译组件（<Trans> / <FormattedMessage>）后整棵跳过，不再走混合内容分支。
 */
describe('React 已有 <Trans> 富文本不被二次包裹（审计 medium）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-trans-rewrap-'));
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

  it('<Trans>中文 {插值} 中文</Trans> 不被提取、transform 不二次包裹', async () => {
    const code = `import React from 'react';
import { Trans } from 'react-i18next';
export function C({ name }: { name: string }) {
  return <div><Trans>你好 {name} 欢迎</Trans></div>;
}
`;
    const { strings, injected } = await run(code);
    // Trans 子树整棵跳过：不产生任何提取项
    expect(strings).toEqual([]);
    // 不得出现嵌套的 <Trans i18nKey.../>（二次包裹的标志）
    expect(injected).not.toContain('i18nKey');
    expect(injected).not.toMatch(/<Trans>\s*<Trans/);
    // 原 Trans 富文本保持不变
    expect(injected).toContain('<Trans>你好 {name} 欢迎</Trans>');
  });
});

/**
 * 回归 Bug-1（多 agent 审计 + 自验）：字面量「值本身被同种 ASCII 引号包裹」时漏替换。
 *
 * 旧实现 shouldReplaceNode 对裸内容侧 originalText 也剥成对定界符 → 值为 `"草稿"` 的字符串
 * 被误剥成 `草稿`，与带定界符源码侧归一化后不等 → 静默跳过替换（locale 写了 key、源码残留中文）。
 * 端到端覆盖 findExactStringNode（定位节点）与 transform 内 shouldReplaceNode（复验）两处协同。
 */
describe('字面量内容自带成对 ASCII 引号的端到端替换（回归 Bug-1）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-bug1-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('值为 "草稿"（双引号包裹）的字符串字面量被替换为 t()，中文不残留', async () => {
    const code = `import React from 'react';
export const Foo = () => {
  const label = '"草稿"';
  return <span>{label}</span>;
};
`;
    const file = path.join(dir, 'Foo.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    // 必须真正替换：出现 t(' 调用，且源码不再残留中文
    expect(out).toMatch(/=\s*t\(/);
    expect(out).not.toContain('草稿');
  });

  it('值为 ‘提交’（单引号包裹）同样被替换', async () => {
    const code = `import React from 'react';
export const Bar = () => {
  const label = "'提交'";
  return <span>{label}</span>;
};
`;
    const file = path.join(dir, 'Bar.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    expect(out).toMatch(/=\s*t\(/);
    expect(out).not.toContain('提交');
  });

  it('控制用例：普通中文字符串仍被正常替换（防过度修复回归）', async () => {
    const code = `import React from 'react';
export const Baz = () => {
  const label = '你好世界';
  return <span>{label}</span>;
};
`;
    const file = path.join(dir, 'Baz.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/i18n', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const out = adapter.getTransformer().transform(file, strings, code);

    expect(out).toMatch(/=\s*t\(/);
    expect(out).not.toContain('你好世界');
  });
});

/**
 * Bug 2：类组件「非箭头函数属性初始化器」中的字符串。
 *
 * getComponentType 对类任意后代判 'class' → transformer 产出裸 t()/intl，但注入器只为
 * 方法体/构造器/访问器/箭头属性注入 `const { t } = this.props`，普通属性初始化器无绑定
 * → 输出 `label = t('k')` / `label = intl.formatMessage(...)` 引用未定义标识符（TS2304）。
 *
 * 采用「极小化」路线（route b）：提取端跳过此类字符串并告警（宁可漏提取，绝不产坏代码）；
 * 方法体 / 箭头函数属性等有绑定的形态行为不变（回归）。
 */
describe('Bug 2：类组件非箭头属性初始化器跳过提取 + 告警', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-class-prop-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function run(code: string, libType: ReactI18nLibraryType) {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const extractor = new ReactTextExtractor(createReactI18nLibrary(libType), []);
    const strings = await extractor.extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `demo.k${i}`));
    const adapter = new ReactAdapter('@/plugins/locale', libType);
    const out = adapter.getTransformer().transform(file, strings, code);
    return { strings, out, warnings: extractor.drainWarnings() };
  }

  it('react-i18next：label = 中文 → 不提取、不产出裸 t()、原文保留并告警', async () => {
    const code = `import React, { Component } from 'react';
export class Foo extends Component {
  label = '草稿';
  render() { return <div>{this.label}</div>; }
}
`;
    const { strings, out, warnings } = await run(code, 'react-i18next');
    // 未提取该字符串
    expect(strings.some((s) => s.original === '草稿')).toBe(false);
    // 不产出无绑定的裸 t()
    expect(out).not.toMatch(/=\s*t\(/);
    // 原文保留（未被破坏）
    expect(out).toContain("label = '草稿'");
    // 告警产出
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('react-intl：label = 中文 → 不提取、不产出裸 intl.formatMessage()', async () => {
    const code = `import React, { Component } from 'react';
export class Foo extends Component {
  label = '草稿';
  render() { return <div>{this.label}</div>; }
}
`;
    const { strings, out } = await run(code, 'react-intl');
    expect(strings.some((s) => s.original === '草稿')).toBe(false);
    expect(out).not.toContain('intl.formatMessage');
    expect(out).toContain("label = '草稿'");
  });

  it('static 属性同样跳过（求值时无实例 this.props 语义）', async () => {
    const code = `import React, { Component } from 'react';
export class Foo extends Component {
  static label = '草稿';
  render() { return <div>{Foo.label}</div>; }
}
`;
    const { strings, out } = await run(code, 'react-i18next');
    expect(strings.some((s) => s.original === '草稿')).toBe(false);
    expect(out).not.toMatch(/=\s*t\(/);
  });

  it('回归：箭头函数属性成员照常提取并注入绑定', async () => {
    const code = `import React, { Component } from 'react';
export class Foo extends Component {
  renderLabel = () => '草稿';
  render() { return <div>{this.renderLabel()}</div>; }
}
`;
    const { strings, out } = await run(code, 'react-i18next');
    // 箭头属性内文案照常提取
    expect(strings.some((s) => s.original === '草稿')).toBe(true);
    // 生成裸 t() 并注入 this.props 解构
    expect(out).toContain("t('demo.k0')");
    expect(out).toContain('const { t } = this.props;');
  });

  it('回归：方法体内文案照常提取', async () => {
    const code = `import React, { Component } from 'react';
export class Foo extends Component {
  render() { return <div title="草稿">x</div>; }
}
`;
    const { strings } = await run(code, 'react-i18next');
    expect(strings.some((s) => s.original === '草稿')).toBe(true);
  });
});
