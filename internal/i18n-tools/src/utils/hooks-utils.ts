import ts from 'typescript';

/**
 * React Hooks依赖项处理工具类
 * 提供hooks依赖项的添加和移除功能
 */
export class HooksUtils {
  /**
   * 为使用intl的hooks添加intl到依赖项数组
   * @param code - 源代码
   * @returns 处理后的代码
   */
  static addIntlToHooksDependencies(code: string): string {
    const sourceFile = ts.createSourceFile(
      'temp.tsx',
      code,
      ts.ScriptTarget.Latest,
      true,
    );
    const hooksToFix: {
      node: ts.CallExpression;
      needsIntl: boolean;
      start: number;
      end: number;
    }[] = [];

    // 遍历AST找到hooks调用
    const visitNode = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        let hookName: string | undefined;

        // 处理直接调用形式：useMemo, useCallback等
        if (ts.isIdentifier(node.expression)) {
          hookName = node.expression.text;
        }
        // 处理React命名空间调用形式：React.useMemo, React.useCallback等
        else if (
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'React' &&
          ts.isIdentifier(node.expression.name)
        ) {
          hookName = node.expression.name.text;
        }

        // 检查是否是需要依赖项的hooks
        if (
          hookName &&
          ['useCallback', 'useMemo', 'useEffect', 'useLayoutEffect'].includes(
            hookName,
          )
        ) {
          const needsIntl = this.hookUsesIntl(node);
          if (needsIntl) {
            hooksToFix.push({
              node,
              needsIntl,
              start: node.getStart(sourceFile),
              end: node.getEnd(),
            });
          }
        }
      }
      ts.forEachChild(node, visitNode);
    };

    visitNode(sourceFile);

    // 从后往前处理，避免位置偏移问题
    hooksToFix.sort((a, b) => b.start - a.start);

    for (const hookInfo of hooksToFix) {
      const hookCall = hookInfo.node;

      // 检查是否已经有依赖项数组
      if (hookCall.arguments.length >= 2) {
        const depsArg = hookCall.arguments[1]!;
        if (ts.isArrayLiteralExpression(depsArg)) {
          // 检查依赖项数组中是否已经有intl
          const hasIntl = depsArg.elements.some(
            (element) => ts.isIdentifier(element) && element.text === 'intl',
          );

          if (!hasIntl) {
            // 添加intl到依赖项数组
            const depsStart = depsArg.getStart(sourceFile) + 1; // 跳过开头的 [
            const depsEnd = depsArg.getEnd() - 1; // 跳过结尾的 ]
            const existingDeps = code.slice(depsStart, depsEnd).trim();

            let newDeps: string;
            if (!existingDeps) {
              newDeps = 'intl';
            } else {
              // 检查现有依赖项是否以逗号结尾
              if (existingDeps.endsWith(',')) {
                newDeps = `${existingDeps} intl`;
              } else {
                newDeps = `${existingDeps}, intl`;
              }
            }

            code = code.slice(0, depsStart) + newDeps + code.slice(depsEnd);
          }
        }
      } else if (hookCall.arguments.length === 1) {
        // 没有依赖项数组，在第一个参数后添加[intl]
        const firstArg = hookCall.arguments[0]!;
        const insertPos = firstArg.getEnd();
        code = code.slice(0, insertPos) + ', [intl]' + code.slice(insertPos);
      }
    }

    return code;
  }

  /**
   * 检查一个Hook函数的函数体内部是否使用了`intl`对象
   * @param hookCall - Hook调用的AST节点
   * @returns 如果在Hook的函数体内检测到`intl`的使用，则返回true
   */
  private static hookUsesIntl(hookCall: ts.CallExpression): boolean {
    if (hookCall.arguments.length === 0) return false;

    const firstArg = hookCall.arguments[0]!;
    let usesIntl = false;

    const checkNode = (node: ts.Node): void => {
      // 检查是否有intl.formatMessage调用
      if (ts.isPropertyAccessExpression(node)) {
        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'intl'
        ) {
          usesIntl = true;
          return;
        }
      }

      // 检查是否直接使用了intl变量
      if (ts.isIdentifier(node) && node.text === 'intl') {
        usesIntl = true;
        return;
      }

      if (!usesIntl) {
        ts.forEachChild(node, checkNode);
      }
    };

    checkNode(firstArg);
    return usesIntl;
  }
}
