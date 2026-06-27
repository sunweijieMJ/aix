import ts from 'typescript';
import type { ReactI18nLibrary } from './libraries';

/**
 * 需要把翻译变量纳入依赖数组的 hooks 列表。
 *
 * Why 抽成共享常量：generate 阶段 addTranslationVarToHooksDependencies（add）与
 * restore 阶段 ReactImportManager.cleanupHookDependencies（remove）必须使用同一份
 * 列表，否则 round-trip 非对称——例如 add 端含 useLayoutEffect 而 remove 端漏掉，
 * 会在 restore 后留下指向已删除变量的悬空依赖（TS2304 / ReferenceError）。
 */
export const TRANSLATION_DEPENDENCY_HOOKS = [
  'useCallback',
  'useMemo',
  'useEffect',
  'useLayoutEffect',
];

/**
 * 从 CallExpression 解析 hook 名，兼容裸 Identifier（`useEffect(...)`）与
 * `React.useXxx` 成员调用形式。add / remove 两端共用，保证对称识别。
 */
export function resolveHookName(node: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text;
  }
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'React' &&
    ts.isIdentifier(node.expression.name)
  ) {
    return node.expression.name.text;
  }
  return undefined;
}

/**
 * React Hooks依赖项处理工具类
 * 提供hooks依赖项的添加和移除功能
 */
export class HooksUtils {
  /**
   * 为使用翻译变量的hooks添加到依赖项数组（由 library 适配器驱动）
   */
  static addTranslationVarToHooksDependencies(code: string, library: ReactI18nLibrary): string {
    const varName = library.translationVarName;
    const sourceFile = ts.createSourceFile('temp.tsx', code, ts.ScriptTarget.Latest, true);
    const hooksToFix: {
      node: ts.CallExpression;
      needsVar: boolean;
      start: number;
      end: number;
    }[] = [];

    const visitNode = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const hookName = resolveHookName(node);

        if (hookName && TRANSLATION_DEPENDENCY_HOOKS.includes(hookName)) {
          const needsVar = this.hookUsesTranslationVar(node, library);
          if (needsVar) {
            hooksToFix.push({
              node,
              needsVar,
              start: node.getStart(sourceFile),
              end: node.getEnd(),
            });
          }
        }
      }
      ts.forEachChild(node, visitNode);
    };

    visitNode(sourceFile);

    hooksToFix.sort((a, b) => b.start - a.start);

    for (const hookInfo of hooksToFix) {
      const hookCall = hookInfo.node;

      if (hookCall.arguments.length >= 2) {
        const depsArg = hookCall.arguments[1]!;
        if (ts.isArrayLiteralExpression(depsArg)) {
          const hasVar = depsArg.elements.some(
            (element) => ts.isIdentifier(element) && element.text === varName,
          );

          if (!hasVar) {
            const depsStart = depsArg.getStart(sourceFile) + 1;
            const depsEnd = depsArg.getEnd() - 1;
            const existingDeps = code.slice(depsStart, depsEnd).trim();

            let newDeps: string;
            if (!existingDeps) {
              newDeps = varName;
            } else if (existingDeps.endsWith(',')) {
              newDeps = `${existingDeps} ${varName}`;
            } else {
              newDeps = `${existingDeps}, ${varName}`;
            }

            code = code.slice(0, depsStart) + newDeps + code.slice(depsEnd);
          }
        }
      }
      // 单参 hook（如 `useEffect(fn)` 无依赖数组）语义是「每次渲染执行」，
      // 不能擅自补 `, [t]` —— 那会把语义改成「仅 t 变化时执行」（≈仅首次），
      // 且 restore 端只删数组里的 t、无法还原成无数组形态，破坏往返一致性。
      // 故无依赖数组时保持原样不动。
    }

    return code;
  }

  /**
   * 检查 Hook 函数体内部是否使用了翻译变量
   */
  private static hookUsesTranslationVar(
    hookCall: ts.CallExpression,
    library: ReactI18nLibrary,
  ): boolean {
    if (hookCall.arguments.length === 0) return false;

    const firstArg = hookCall.arguments[0]!;
    let usesVar = false;
    const varName = library.translationVarName;

    const checkNode = (node: ts.Node): void => {
      if (usesVar) return;

      // 属性访问 `x.y`：只有「接收者 === 翻译变量」才算使用（intl.formatMessage、t.foo）。
      // 关键：成员名 node.name 是属性名、不是对自由变量的引用，绝不能当作使用翻译变量——
      // 否则 `props.t(...)` / `socket.intl` 这类与 i18n 无关的成员访问会被误判，进而给无关
      // hook 的依赖数组注入作用域内不存在的 t/intl，产出 TS2304 / ReferenceError 的代码。
      // 故这里只递归接收者 node.expression，跳过 node.name。
      if (ts.isPropertyAccessExpression(node)) {
        if (ts.isIdentifier(node.expression) && node.expression.text === varName) {
          usesVar = true;
          return;
        }
        checkNode(node.expression);
        return;
      }

      // 检查直接使用翻译变量 (t('key'))。注意 ElementAccessExpression `obj[t]` 不是
      // PropertyAccessExpression，会落到下方 forEachChild，其索引标识符 t 仍被正确计为使用。
      if (ts.isIdentifier(node) && node.text === varName) {
        usesVar = true;
        return;
      }

      ts.forEachChild(node, checkNode);
    };

    checkNode(firstArg);
    return usesVar;
  }
}
