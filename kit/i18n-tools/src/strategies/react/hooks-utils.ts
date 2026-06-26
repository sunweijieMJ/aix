import ts from 'typescript';
import type { ReactI18nLibrary } from './libraries';

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
        let hookName: string | undefined;

        if (ts.isIdentifier(node.expression)) {
          hookName = node.expression.text;
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'React' &&
          ts.isIdentifier(node.expression.name)
        ) {
          hookName = node.expression.name.text;
        }

        if (
          hookName &&
          ['useCallback', 'useMemo', 'useEffect', 'useLayoutEffect'].includes(hookName)
        ) {
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
      // 检查翻译变量的属性访问 (intl.formatMessage)
      if (ts.isPropertyAccessExpression(node)) {
        if (ts.isIdentifier(node.expression) && node.expression.text === varName) {
          usesVar = true;
          return;
        }
      }

      // 检查直接使用翻译变量 (t('key'))
      if (ts.isIdentifier(node) && node.text === varName) {
        usesVar = true;
        return;
      }

      if (!usesVar) {
        ts.forEachChild(node, checkNode);
      }
    };

    checkNode(firstArg);
    return usesVar;
  }
}
