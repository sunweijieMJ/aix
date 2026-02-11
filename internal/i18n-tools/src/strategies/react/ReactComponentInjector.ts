import type { IComponentInjector } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import { ReactASTUtils } from '../../utils/ast/ReactASTUtils';
import { ReactImportManager } from './ReactImportManager';
import type { ReactI18nLibrary } from './libraries';

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
}

/**
 * 负责向React组件注入国际化能力（由 library 适配器驱动）
 */
export class ReactComponentInjector implements IComponentInjector {
  private tImport: string;
  private library: ReactI18nLibrary;

  constructor(tImport: string = '@/plugins/locale', library: ReactI18nLibrary) {
    this.tImport = tImport;
    this.library = library;
  }

  inject(code: string): string {
    // Phase 1: 分析原始代码，找出需要注入的组件
    const initialSourceFile = ts.createSourceFile(
      'temp.tsx',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const componentsToModify: ComponentInfo[] = [];

    const initialVisitor = (node: ts.Node) => {
      const componentInfo = ReactASTUtils.getComponentInfo(node);
      if (componentInfo) {
        const hasIntl = this.library.isTranslationAvailableInScope(
          componentInfo.node,
          initialSourceFile,
        );
        const needsIntl =
          !hasIntl &&
          this.library.componentUsesTranslation(
            componentInfo.node,
            initialSourceFile,
          );

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

    // Phase 2: 添加必要的导入
    const importManager = new ReactImportManager(this.tImport, this.library);
    let codeWithImports = code;
    if (componentsToModify.some((c) => c.injectionType === 'hook')) {
      codeWithImports = importManager.addI18nImports(codeWithImports, [
        this.library.hookName,
      ]);
    }
    if (componentsToModify.some((c) => c.injectionType === 'hoc')) {
      const hocImports = this.library.getImportSpecifiers({
        hasJsxComponent: false,
        hasHook: false,
        hasHOC: true,
      });
      codeWithImports = importManager.addI18nImports(
        codeWithImports,
        hocImports,
      );
    }

    // Phase 3: 重新解析带有新导入的代码并应用转换
    const sourceFileWithImports = ts.createSourceFile(
      'temp.tsx',
      codeWithImports,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const transformations: Transformation[] = [];

    const finalVisitor = (node: ts.Node) => {
      const componentInfo = ReactASTUtils.getComponentInfo(node);
      if (componentInfo) {
        const componentToModify = componentsToModify.find(
          (c) => c.name === componentInfo.name && c.type === componentInfo.type,
        );

        if (componentToModify) {
          if (
            componentToModify.injectionType === 'hook' &&
            componentInfo.type === 'function'
          ) {
            this.injectHook(
              componentInfo.node as ts.ArrowFunction | ts.FunctionExpression,
              sourceFileWithImports,
              transformations,
            );
          } else if (
            componentToModify.injectionType === 'hoc' &&
            componentInfo.type === 'class'
          ) {
            this.injectHOC(
              componentInfo.node as ts.ClassDeclaration,
              componentInfo.name,
              sourceFileWithImports,
              transformations,
            );
          }
        }
      }
      ts.forEachChild(node, finalVisitor);
    };
    ts.forEachChild(sourceFileWithImports, finalVisitor);

    return this.applyTransformations(codeWithImports, transformations);
  }

  /**
   * 注入 Hook 到函数组件
   */
  private injectHook(
    node: ts.ArrowFunction | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
    transformations: Transformation[],
  ): void {
    const body = node.body;
    if (body && ts.isBlock(body)) {
      const injectionPos = body.getStart(sourceFile) + 1;
      const injectionText = `\n  ${this.library.hookDeclaration}`;
      transformations.push({
        start: injectionPos,
        end: injectionPos,
        text: injectionText,
      });
    }
  }

  /**
   * 注入 HOC 到类组件
   */
  private injectHOC(
    classNode: ts.ClassDeclaration,
    className: string,
    sourceFile: ts.SourceFile,
    transformations: Transformation[],
  ): void {
    if (!className) return;

    const propsType = this.library.hocPropsType;
    const varName = this.library.translationVarName;

    // 1. 添加 Props 类型
    if (classNode.heritageClauses) {
      for (const clause of classNode.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types[0]) {
          const typeNode = clause.types[0];
          const typeName = typeNode.expression.getText(sourceFile);
          if (typeName === 'Component' || typeName === 'React.Component') {
            if (typeNode.typeArguments && typeNode.typeArguments.length > 0) {
              const propsTypeArg = typeNode.typeArguments[0]!;
              if (!propsTypeArg.getText(sourceFile).includes(propsType)) {
                transformations.push({
                  start: propsTypeArg.getEnd(),
                  end: propsTypeArg.getEnd(),
                  text: ` & ${propsType}`,
                });
              }
            } else {
              transformations.push({
                start: typeNode.expression.getEnd(),
                end: typeNode.expression.getEnd(),
                text: `<${propsType}>`,
              });
            }
          }
        }
      }
    }

    // 2. 修复 constructor props 类型
    const constructor = classNode.members.find(
      (member): member is ts.ConstructorDeclaration =>
        ts.isConstructorDeclaration(member),
    );
    if (constructor && constructor.parameters.length > 0) {
      const propsParam = constructor.parameters[0]!;
      if (
        propsParam.name.getText(sourceFile) === 'props' &&
        propsParam.type &&
        !propsParam.type.getText(sourceFile).includes(propsType)
      ) {
        transformations.push({
          start: propsParam.type.getEnd(),
          end: propsParam.type.getEnd(),
          text: ` & ${propsType}`,
        });
      }
    }

    // 3. 在使用翻译的方法中添加解构声明
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
        const usesTranslation = this.library.componentUsesTranslation(
          body,
          sourceFile,
        );
        const hasDeclaration = body
          .getText(sourceFile)
          .includes(`const { ${varName} } = this.props`);

        if (usesTranslation && !hasDeclaration && ts.isBlock(body)) {
          const injectionPos = body.getStart(sourceFile) + 1;
          transformations.push({
            start: injectionPos,
            end: injectionPos,
            text: `\n    const { ${varName} } = this.props;\n`,
          });
        }
      }
    }

    // 4. 用 HOC 包裹组件
    const exportModifier = classNode.modifiers?.find(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    const tempClassName = `${className}WithOutIntl`;

    if (classNode.name) {
      if (exportModifier) {
        transformations.push({
          start: exportModifier.getStart(sourceFile),
          end: exportModifier.getEnd() + 1,
          text: '',
        });
      }

      transformations.push({
        start: classNode.name.getStart(sourceFile),
        end: classNode.name.getEnd(),
        text: tempClassName,
      });

      const hocWrapper = this.library.generateHOCWrapper(tempClassName);
      const hocStatement = exportModifier
        ? `\n\nexport const ${className} = ${hocWrapper};`
        : `\nconst ${className} = ${hocWrapper};`;

      transformations.push({
        start: classNode.getEnd(),
        end: classNode.getEnd(),
        text: hocStatement,
      });
    }
  }

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
}
