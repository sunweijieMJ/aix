import type { IComponentInjector } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import { ASTUtils } from '../../utils/ast/ASTUtils';
import { ReactImportManager } from './ReactImportManager';

// Local type definitions to avoid import issues
interface Transformation {
  start: number;
  end: number;
  text: string;
}
interface ComponentInfo {
  name: string;
  type: 'class' | 'function';
  node:
    | ts.ClassDeclaration
    | ts.FunctionDeclaration
    | ts.ArrowFunction
    | ts.FunctionExpression;
  needsIntl: boolean;
  hasIntl: boolean;
  injectionType: 'hook' | 'hoc' | 'none';
  // Position is not stored here anymore as it becomes stale
}

/**
 * @class ComponentInjector
 * @description 负责向React组件注入国际化（i18n）能力。
 *
 * 该类通过分析AST（抽象语法树），智能地为需要国际化的React组件添加`useIntl` Hook（用于函数组件）
 * 或使用`injectIntl`高阶组件（HOC）包裹（用于类组件）。
 *
 * 工作流程分为三个阶段：
 * 1. **分析阶段**: 遍历原始代码的AST，识别出所有需要注入`intl`实例但当前作用域内没有的组件。
 * 2. **导入阶段**: 根据需要注入的类型（Hook或HOC），使用`ImportManager`向代码中添加必要的`react-intl`导入语句。
 * 3. **转换阶段**: 重新解析带有新导入的代码，计算出准确的注入位置，并生成所有代码转换操作（如添加Hook，修改类定义等）。
 *    最后，将所有转换操作应用到代码上，生成最终的代码字符串。
 */
export class ReactComponentInjector implements IComponentInjector {
  /**
   * @method inject
   * @description 执行注入操作，为文件中的所有适用组件添加国际化能力。
   * @returns {string} - 经过转换和注入操作后的新代码字符串。
   */
  inject(code: string): string {
    // Phase 1: Analyze the original code to find which components need injection.
    const initialSourceFile = ts.createSourceFile(
      'temp.tsx',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const componentsToModify: ComponentInfo[] = [];

    const initialVisitor = (node: ts.Node) => {
      const componentInfo = ASTUtils.getComponentInfo(node);
      if (componentInfo) {
        const hasIntl = this.isIntlAvailableInScope(
          componentInfo.node,
          initialSourceFile,
        );
        const needsIntl =
          !hasIntl &&
          this.componentUsesIntl(componentInfo.node, initialSourceFile);

        if (needsIntl) {
          const injectionType =
            componentInfo.type === 'function' ? 'hook' : 'hoc';
          componentsToModify.push({
            ...componentInfo,
            needsIntl,
            hasIntl,
            injectionType,
          });
        }
      }
      ts.forEachChild(node, initialVisitor);
    };
    ts.forEachChild(initialSourceFile, initialVisitor);

    if (componentsToModify.length === 0) {
      return code;
    }

    // Phase 2: Add necessary imports.
    const importManager = new ReactImportManager();
    let codeWithImports = code;
    if (componentsToModify.some((c) => c.injectionType === 'hook')) {
      codeWithImports = importManager.addI18nImports(codeWithImports, [
        'useIntl',
      ]);
    }
    if (componentsToModify.some((c) => c.injectionType === 'hoc')) {
      codeWithImports = importManager.addI18nImports(codeWithImports, [
        'injectIntl',
        'WrappedComponentProps',
      ]);
    }

    // Phase 3: Re-parse the code with new imports and apply transformations.
    const sourceFileWithImports = ts.createSourceFile(
      'temp.tsx',
      codeWithImports,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const transformations: Transformation[] = [];

    const finalVisitor = (node: ts.Node) => {
      const componentInfo = ASTUtils.getComponentInfo(node);
      if (componentInfo) {
        const componentToModify = componentsToModify.find(
          (c) => c.name === componentInfo.name && c.type === componentInfo.type,
        );

        if (componentToModify) {
          if (
            componentToModify.injectionType === 'hook' &&
            componentInfo.type === 'function'
          ) {
            const body = (
              componentInfo.node as ts.ArrowFunction | ts.FunctionExpression
            ).body;
            if (body && ts.isBlock(body)) {
              const injectionPos = body.getStart(sourceFileWithImports) + 1;
              const injectionText = `\n  const intl = useIntl();`;
              transformations.push({
                start: injectionPos,
                end: injectionPos,
                text: injectionText,
              });
            }
          } else if (
            componentToModify.injectionType === 'hoc' &&
            componentInfo.type === 'class'
          ) {
            const classNode = componentInfo.node as ts.ClassDeclaration;
            const className = classNode.name?.getText(sourceFileWithImports);

            if (className) {
              // 1. Add `& WrappedComponentProps` or `<WrappedComponentProps>` to props type
              if (classNode.heritageClauses) {
                for (const clause of classNode.heritageClauses) {
                  if (
                    clause.token === ts.SyntaxKind.ExtendsKeyword &&
                    clause.types[0]
                  ) {
                    const typeNode = clause.types[0];
                    const typeName = typeNode.expression.getText(
                      sourceFileWithImports,
                    );
                    if (
                      typeName === 'Component' ||
                      typeName === 'React.Component'
                    ) {
                      if (
                        typeNode.typeArguments &&
                        typeNode.typeArguments.length > 0
                      ) {
                        const propsType = typeNode.typeArguments[0]!;
                        if (
                          !propsType
                            .getText(sourceFileWithImports)
                            .includes('WrappedComponentProps')
                        ) {
                          transformations.push({
                            start: propsType.getEnd(),
                            end: propsType.getEnd(),
                            text: ' & WrappedComponentProps',
                          });
                        }
                      } else {
                        transformations.push({
                          start: typeNode.expression.getEnd(),
                          end: typeNode.expression.getEnd(),
                          text: '<WrappedComponentProps>',
                        });
                      }
                    }
                  }
                }
              }

              // 2. Fix constructor props type
              const constructor = classNode.members.find(
                (member): member is ts.ConstructorDeclaration =>
                  ts.isConstructorDeclaration(member),
              );
              if (constructor && constructor.parameters.length > 0) {
                const propsParam = constructor.parameters[0]!;
                if (
                  propsParam.name.getText(sourceFileWithImports) === 'props' &&
                  propsParam.type &&
                  !propsParam.type
                    .getText(sourceFileWithImports)
                    .includes('WrappedComponentProps')
                ) {
                  transformations.push({
                    start: propsParam.type.getEnd(),
                    end: propsParam.type.getEnd(),
                    text: ' & WrappedComponentProps',
                  });
                }
              }

              // 3. Add `const { intl } = this.props;` to all methods using `intl`
              for (const member of classNode.members) {
                let body: ts.Block | ts.ConciseBody | undefined;
                if (ts.isMethodDeclaration(member)) {
                  body = member.body;
                } else if (
                  ts.isPropertyDeclaration(member) &&
                  member.initializer &&
                  ts.isArrowFunction(member.initializer)
                ) {
                  body = member.initializer.body;
                }

                if (body) {
                  const usesIntl = this.componentUsesIntl(
                    body,
                    sourceFileWithImports,
                  );
                  const hasIntlDeclaration = body
                    .getText(sourceFileWithImports)
                    .includes('const { intl } = this.props');

                  if (usesIntl && !hasIntlDeclaration && ts.isBlock(body)) {
                    const injectionPos =
                      body.getStart(sourceFileWithImports) + 1;
                    transformations.push({
                      start: injectionPos,
                      end: injectionPos,
                      text: '\n    const { intl } = this.props;\n',
                    });
                  }
                }
              }

              // 4. Wrap component with injectIntl
              const exportModifier = classNode.modifiers?.find(
                (m) => m.kind === ts.SyntaxKind.ExportKeyword,
              );
              const tempClassName = `${className}WithOutIntl`;

              if (classNode.name) {
                if (exportModifier) {
                  // Remove 'export'
                  transformations.push({
                    start: exportModifier.getStart(sourceFileWithImports),
                    end: exportModifier.getEnd() + 1,
                    text: '',
                  });
                }

                // Rename the class
                transformations.push({
                  start: classNode.name.getStart(sourceFileWithImports),
                  end: classNode.name.getEnd(),
                  text: tempClassName,
                });

                // Add the HOC export/declaration after the class
                const hocStatement = exportModifier
                  ? `\n\nexport const ${className} = injectIntl(${tempClassName});`
                  : `\nconst ${className} = injectIntl(${tempClassName});`;

                transformations.push({
                  start: classNode.getEnd(),
                  end: classNode.getEnd(),
                  text: hocStatement,
                });
              }
            }
          }
        }
      }
      ts.forEachChild(node, finalVisitor);
    };
    ts.forEachChild(sourceFileWithImports, finalVisitor);

    return this.applyTransformations(codeWithImports, transformations);
  }

  /**
   * @method applyTransformations
   * @private
   * @description 将所有收集到的代码转换操作应用到源代码上。
   *
   * 为了避免位置错乱，转换操作会按照起始位置（`start`）从后往前进行应用。
   *
   * @param {string} code - 待转换的代码。
   * @param {Transformation[]} transformations - 一个包含所有代码修改指令的数组。
   * @returns {string} - 应用所有转换后的最终代码。
   */
  private applyTransformations(
    code: string,
    transformations: Transformation[],
  ): string {
    transformations.sort((a, b) => b.start - a.start);
    let result = code;
    for (const { start, end, text } of transformations) {
      result = result.slice(0, start) + text + result.slice(end);
    }
    return result;
  }

  /**
   * @method isIntlAvailableInScope
   * @private
   * @description 检查给定的AST节点作用域内是否已经可以访问到`intl`对象。
   *
   * @param {ts.Node} node - 当前组件或函数的AST节点。
   * @param {ts.SourceFile} sourceFile - 整个文件的源文件AST。
   * @returns {boolean} - 如果`intl`已在作用域内，则返回`true`。
   */
  private isIntlAvailableInScope(
    node: ts.Node,
    sourceFile: ts.SourceFile,
  ): boolean {
    const componentText = node.getText(sourceFile);
    return (
      /const\s+intl\s*=\s*useIntl/.test(componentText) ||
      /props\.intl/.test(componentText) ||
      /this\.props\.intl/.test(componentText)
    );
  }

  /**
   * @method componentUsesIntl
   * @private
   * @description 检查一个组件（或任何AST节点）内部是否实际使用了`intl.formatMessage`。
   * @param {ts.Node} node - 要检查的AST节点。
   * @param {ts.SourceFile} sourceFile - 源文件AST。
   * @returns {boolean} - 如果使用了`intl.formatMessage`，则返回`true`。
   */
  private componentUsesIntl(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    let uses = false;
    const visitor = (child: ts.Node) => {
      if (ts.isCallExpression(child)) {
        const exprText = child.expression.getText(sourceFile);
        if (exprText.endsWith('.formatMessage')) {
          uses = true;
        }
      }
      if (!uses) {
        ts.forEachChild(child, visitor);
      }
    };
    visitor(node);
    return uses;
  }
}
