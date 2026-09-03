import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { ReactASTUtils } from '../src/strategies/react/react-ast-utils';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

function parseTsx(code: string): ts.SourceFile {
  return ts.createSourceFile('c.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function firstFunctionNode(
  code: string,
): ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression {
  let found: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | undefined;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(parseTsx(code));
  if (!found) throw new Error('未找到函数节点');
  return found;
}

function findMethodBody(code: string, methodName: string): ts.Block {
  let body: ts.Block | undefined;
  const visit = (n: ts.Node): void => {
    if (body) return;
    if (
      ts.isMethodDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === methodName &&
      n.body
    ) {
      body = n.body;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(parseTsx(code));
  if (!body) throw new Error('未找到方法体');
  return body;
}

/**
 * 回归（审计 low #7）：isFunctionComponent 此前只认裸 Identifier 形式的 hook 调用，
 * 漏认 `React.useXxx` 命名空间形式——而同库 resolveHookName / isClassComponent 均已支持。
 * 仅含 React.useXxx() 调用且无 JSX 的函数会被误判为非组件。
 */
describe('ReactASTUtils.isFunctionComponent — React.useXxx 命名空间 hook', () => {
  it('仅含 React.useState() 且无 JSX 的函数 → 识别为函数组件', () => {
    const fn = firstFunctionNode(`function C() { const [s] = React.useState(0); return s; }`);
    expect(ReactASTUtils.isFunctionComponent(fn)).toBe(true);
  });

  it('回归保护：裸 useState() 仍识别', () => {
    const fn = firstFunctionNode(`function C() { const [s] = useState(0); return s; }`);
    expect(ReactASTUtils.isFunctionComponent(fn)).toBe(true);
  });
});

/**
 * 回归（审计 low #8）：bodyDestructuresProp 此前用 forEachChild 递归整个方法体（含嵌套函数）。
 * 嵌套回调里的 `const { t } = this.props` 只作用于该回调，不构成方法体顶层的声明；
 * 误判"已解构"会跳过顶层注入 → 顶层用到 t() 时运行时 `t is not defined`。
 */
describe('ReactComponentInjector.bodyDestructuresProp — 不跨嵌套函数作用域', () => {
  const injector = new ReactComponentInjector(null as never, null as never);
  const call = (body: ts.Block): boolean =>
    (
      injector as unknown as { bodyDestructuresProp: (b: ts.Block, v: string) => boolean }
    ).bodyDestructuresProp(body, 't');

  it('解构仅在嵌套回调内 → 方法体顶层视为未声明（false）', () => {
    const body = findMethodBody(
      `class C { render() { data.map(item => { const { t } = this.props; return t(item); }); return null; } }`,
      'render',
    );
    expect(call(body)).toBe(false);
  });

  it('回归保护：顶层直接解构 → 视为已声明（true）', () => {
    const body = findMethodBody(
      `class C { render() { const { t } = this.props; return t('x'); } }`,
      'render',
    );
    expect(call(body)).toBe(true);
  });
});

/**
 * 回归：isForwardRefOrMemoCallee 此前（isFunctionComponent /
 * isInjectableComponentFunction / getFunctionNodeFromInitializer 三处重复实现）
 * 只认裸 Identifier 形式的 forwardRef/memo 调用（`memo(...)`），漏认命名空间访问
 * 形式（`React.memo(...)`）——与同库 isClassComponent 对 React.Component /
 * React.PureComponent 的判定方式不一致。命名空间形式下 getComponentInfo 认不出
 * 组件，注入器不会注入 useTranslation()，但文案提取仍会产出裸 t() 调用，
 * 运行时 `t is not defined`。
 */
describe('ReactASTUtils.isForwardRefOrMemoCallee — React.memo/forwardRef 命名空间形式', () => {
  it('React.memo(...) → 识别为函数组件', () => {
    const fn = firstFunctionNode(`const C = React.memo(() => <span>{t('x')}</span>);`);
    expect(ReactASTUtils.isFunctionComponent(fn)).toBe(true);
  });

  it('React.forwardRef(...) → 识别为函数组件', () => {
    const fn = firstFunctionNode(
      `const C = React.forwardRef((props, ref) => <span ref={ref}>{t('x')}</span>);`,
    );
    expect(ReactASTUtils.isFunctionComponent(fn)).toBe(true);
  });

  it('回归保护：裸 memo(...) / forwardRef(...) 仍识别', () => {
    const memoFn = firstFunctionNode(`const C = memo(() => <span>{t('x')}</span>);`);
    expect(ReactASTUtils.isFunctionComponent(memoFn)).toBe(true);

    const fwdFn = firstFunctionNode(
      `const C = forwardRef((props, ref) => <span ref={ref}>{t('x')}</span>);`,
    );
    expect(ReactASTUtils.isFunctionComponent(fwdFn)).toBe(true);
  });
});

describe('ReactComponentInjector.inject：React.memo/forwardRef 命名空间形式端到端注入', () => {
  const buildInjector = () => {
    const library = createReactI18nLibrary('react-i18next');
    const importManager = new ReactImportManager('@/plugins/locale', library);
    return new ReactComponentInjector(library, importManager);
  };

  it('React.memo(() => {...}) 内的 t() 调用应被注入 useTranslation hook', () => {
    const injector = buildInjector();
    const code = `const Card = React.memo(() => {\n  return <span title={t('card.title')} />;\n});`;
    const out = injector.inject(code);
    expect(out).toContain('const { t } = useTranslation();');
  });

  it('React.forwardRef((props, ref) => {...}) 内的 t() 调用应被注入 useTranslation hook', () => {
    const injector = buildInjector();
    const code = `const Field = React.forwardRef((props, ref) => {\n  return <span ref={ref} title={t('field.title')} />;\n});`;
    const out = injector.inject(code);
    expect(out).toContain('const { t } = useTranslation();');
  });
});

/**
 * react-gen 审计 R7：类型名比对此前用 `getText().includes(propsType)`，
 * 名字含 hocPropsType 子串的业务类型（PanelWithTranslationToggleProps）被误判为已注入。
 */
describe('ReactASTUtils.typeReferencesName — 按类型引用名精确比对', () => {
  const typeOf = (code: string): ts.TypeNode => {
    let found: ts.TypeNode | undefined;
    const visit = (n: ts.Node): void => {
      if (found) return;
      if (ts.isTypeAliasDeclaration(n)) {
        found = n.type;
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(parseTsx(code));
    if (!found) throw new Error('未找到类型节点');
    return found;
  };

  it('同名类型引用 → true；交叉类型成员命中 → true', () => {
    expect(
      ReactASTUtils.typeReferencesName(typeOf(`type A = WithTranslation;`), 'WithTranslation'),
    ).toBe(true);
    expect(
      ReactASTUtils.typeReferencesName(
        typeOf(`type A = Props & WithTranslation;`),
        'WithTranslation',
      ),
    ).toBe(true);
  });

  it('名字含子串的其它类型 → false', () => {
    expect(
      ReactASTUtils.typeReferencesName(
        typeOf(`type A = PanelWithTranslationToggleProps;`),
        'WithTranslation',
      ),
    ).toBe(false);
  });

  it('泛型实参里的同名类型不算外层引用 → false', () => {
    expect(
      ReactASTUtils.typeReferencesName(
        typeOf(`type A = Props<WithTranslation>;`),
        'WithTranslation',
      ),
    ).toBe(false);
  });
});

/**
 * react-gen 审计 R9：PascalCase 组件按引用传给 map/forEach 等迭代方法时会被逐项当普通函数
 * 调用，注入 hook 即违反 Hooks 规则；而 memo/observer 等 HOC 的按引用包裹不是普通调用。
 */
describe('ReactASTUtils.plainlyCalledNames — 迭代回调实参位', () => {
  it('rows.map(Row) 计入普通调用名', () => {
    const names = ReactASTUtils.plainlyCalledNames(parseTsx(`const x = rows.map(Row);`));
    expect(names.has('Row')).toBe(true);
  });

  it('memo(Foo) / observer(Foo) 不计入（HOC 按引用包裹仍返回组件）', () => {
    const names = ReactASTUtils.plainlyCalledNames(
      parseTsx(`const A = memo(Foo);\nconst B = observer(Bar);`),
    );
    expect(names.has('Foo')).toBe(false);
    expect(names.has('Bar')).toBe(false);
  });

  it('小写回调（rows.map(render)）不计入组件名集合', () => {
    const names = ReactASTUtils.plainlyCalledNames(parseTsx(`const x = rows.map(render);`));
    expect(names.has('render')).toBe(false);
  });

  it('回归保护：Tip() 直接调用仍计入', () => {
    const names = ReactASTUtils.plainlyCalledNames(parseTsx(`const x = <div>{Tip()}</div>;`));
    expect(names.has('Tip')).toBe(true);
  });
});

/**
 * react-gen 审计 R5/A3：「向作用域注入某个名字是否安全」的统一判定。
 */
describe('ReactASTUtils.canBindName — 模块顶层注入名可用性', () => {
  const sf = (code: string): ts.SourceFile => parseTsx(code);

  it('同名具名导入来自非 i18n 模块 → 不可注入', () => {
    expect(
      ReactASTUtils.canBindName(
        sf(`import { useTranslation } from '@/hooks/useTranslation';`),
        'useTranslation',
        { i18nModules: ['react-i18next', '@/plugins/locale'] },
      ),
    ).toBe(false);
  });

  it('同名具名导入来自 i18n 库 → 可注入（工具自身上一轮产物）', () => {
    expect(
      ReactASTUtils.canBindName(
        sf(`import { useTranslation } from 'react-i18next';`),
        'useTranslation',
        { i18nModules: ['react-i18next', '@/plugins/locale'] },
      ),
    ).toBe(true);
  });

  it('kind=type：本地同名 interface / type 也算占用', () => {
    const code = `interface WithTranslation { t: (k: string) => string }`;
    expect(ReactASTUtils.canBindName(sf(code), 'WithTranslation', { kind: 'type' })).toBe(false);
    // 值口径不看类型声明（类型与值不同命名空间）
    expect(ReactASTUtils.canBindName(sf(code), 'WithTranslation')).toBe(true);
  });
});
