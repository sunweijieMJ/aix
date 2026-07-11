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
