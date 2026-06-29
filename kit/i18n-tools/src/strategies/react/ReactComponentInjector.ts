import type { IComponentInjector } from '../../adapters/FrameworkAdapter';
import ts from 'typescript';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import { ReactASTUtils } from './react-ast-utils';
import { type ReactImportManager, HOC_CLASS_SUFFIX } from './ReactImportManager';
import type { ReactI18nLibrary } from './libraries';

interface Transformation {
  start: number;
  end: number;
  text: string;
}
interface ComponentInfo {
  name: string;
  type: 'class' | 'function';
  node: ts.ClassDeclaration | ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
  needsIntl: boolean;
  hasIntl: boolean;
  injectionType: 'hook' | 'hoc' | 'class-destructure' | 'none';
}

/**
 * 负责向React组件注入国际化能力（由 library 适配器驱动）
 */
export class ReactComponentInjector implements IComponentInjector {
  private library: ReactI18nLibrary;
  private importManager: ReactImportManager;

  constructor(library: ReactI18nLibrary, importManager: ReactImportManager) {
    this.library = library;
    this.importManager = importManager;
  }

  inject(code: string): string {
    // Phase 1: 分析原始代码，找出需要注入的组件
    const initialSourceFile = CommonASTUtils.parseSourceFile(code, 'temp.tsx');
    const componentsToModify: ComponentInfo[] = [];

    const initialVisitor = (node: ts.Node) => {
      const componentInfo = ReactASTUtils.getComponentInfo(node);
      if (componentInfo) {
        const usesTranslation = this.library.componentUsesTranslation(
          componentInfo.node,
          initialSourceFile,
        );
        if (usesTranslation) {
          if (componentInfo.type === 'function') {
            // 函数组件：仅有 props.intl（react-intl）不算本地绑定，需注入 useIntl 让裸 intl
            // 有定义（注入 useIntl 在 IntlProvider 下始终安全，不涉及类组件 HOC 二次包裹）。
            const hasBinding = this.library.hasLocalTranslationBinding(
              componentInfo.node,
              initialSourceFile,
            );
            if (!hasBinding) {
              componentsToModify.push({
                ...componentInfo,
                needsIntl: true,
                hasIntl: false,
                injectionType: 'hook',
              });
            }
          } else {
            // 类组件：以「本作用域内是否已存在 this.props.<var> 访问」判定是否已被 HOC
            // （injectIntl / withTranslation）包裹。
            //   - 已包裹：generator 产出的裸 t()/intl 需本地解构 `const { t } = this.props`
            //     才有定义；但绝不能二次注入 HOC（否则 withTranslation()(withTranslation()(…))
            //     或重复 injectIntl）。故只补方法体解构。
            //   - 未包裹：注入完整 HOC（Props 类型 + 方法体解构 + wrapper）。
            const wrapped = this.classAlreadyWrappedByHOC(componentInfo.node, initialSourceFile);
            componentsToModify.push({
              ...componentInfo,
              needsIntl: true,
              hasIntl: wrapped,
              injectionType: wrapped ? 'class-destructure' : 'hoc',
            });
          }
        }
      }
      ts.forEachChild(node, initialVisitor);
    };
    ts.forEachChild(initialSourceFile, initialVisitor);

    if (componentsToModify.length === 0) {
      return code;
    }

    // Phase 2: 添加必要的导入（使用注入的 importManager 以共享配置）
    let codeWithImports = code;
    if (componentsToModify.some((c) => c.injectionType === 'hook')) {
      codeWithImports = this.importManager.addI18nImports(codeWithImports, [this.library.hookName]);
    }
    if (componentsToModify.some((c) => c.injectionType === 'hoc')) {
      const hocImports = this.library.getImportSpecifiers({
        hasJsxComponent: false,
        hasHook: false,
        hasHOC: true,
      });
      codeWithImports = this.importManager.addI18nImports(codeWithImports, hocImports);
    }

    // Phase 3: 重新解析带有新导入的代码并应用转换
    const sourceFileWithImports = CommonASTUtils.parseSourceFile(codeWithImports, 'temp.tsx');
    const transformations: Transformation[] = [];

    const finalVisitor = (node: ts.Node) => {
      const componentInfo = ReactASTUtils.getComponentInfo(node);
      if (componentInfo) {
        const componentToModify = componentsToModify.find(
          (c) => c.name === componentInfo.name && c.type === componentInfo.type,
        );

        if (componentToModify) {
          if (componentToModify.injectionType === 'hook' && componentInfo.type === 'function') {
            this.injectHook(
              componentInfo.node as ts.ArrowFunction | ts.FunctionExpression,
              sourceFileWithImports,
              transformations,
            );
          } else if (componentToModify.injectionType === 'hoc' && componentInfo.type === 'class') {
            this.injectHOC(
              componentInfo.node as ts.ClassDeclaration,
              componentInfo.name,
              sourceFileWithImports,
              transformations,
            );
          } else if (
            componentToModify.injectionType === 'class-destructure' &&
            componentInfo.type === 'class'
          ) {
            // 已被 HOC 包裹的类组件：只补方法体 this.props 解构，不二次包裹。
            this.injectClassMethodDestructure(
              componentInfo.node as ts.ClassDeclaration,
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
    if (!body) return;

    if (ts.isBlock(body)) {
      const injectionPos = body.getStart(sourceFile) + 1;
      const injectionText = `\n  ${this.library.hookDeclaration}`;
      transformations.push({
        start: injectionPos,
        end: injectionPos,
        text: injectionText,
      });
      return;
    }

    // 表达式体箭头组件（`() => <jsx/>`）没有 Block 可插入 hook 声明。
    // 此时属性中的文案仍会被 ReactTransformer 替换为 t()/intl 调用，若不注入
    // hook 就会产出引用未声明 t 的代码（运行时 `t is not defined`）。
    // 解法：把表达式体包成块体 `=> { hookDecl return <expr>; }`。
    // 只有 ArrowFunction 可能是表达式体；FunctionExpression 必带 Block。
    if (ts.isArrowFunction(node)) {
      const start = body.getStart(sourceFile);
      const end = body.getEnd();
      transformations.push({
        start,
        end: start,
        text: `{\n  ${this.library.hookDeclaration}\n  return `,
      });
      transformations.push({
        start: end,
        end,
        text: `;\n}`,
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

    // 1. 添加 Props 类型
    if (classNode.heritageClauses) {
      for (const clause of classNode.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types[0]) {
          const typeNode = clause.types[0];
          const typeName = typeNode.expression.getText(sourceFile);
          // 与 isClassComponent 对齐：PureComponent 也是类组件，HOC 注入后同样需要
          // 在 Props 泛型上追加 WithTranslation，否则 this.props.t 类型检查报错。
          if (
            typeName === 'Component' ||
            typeName === 'React.Component' ||
            typeName === 'PureComponent' ||
            typeName === 'React.PureComponent'
          ) {
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
    const constructor = classNode.members.find((member): member is ts.ConstructorDeclaration =>
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
    this.injectClassMethodDestructure(classNode, sourceFile, transformations);

    // 4. 用 HOC 包裹组件
    const exportModifier = classNode.modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    // `export default class Foo` 的修饰符是 [export, default]。仅删 export 会遗留孤立的
    // `default` 关键字 → 产出 `default class FooWithOutIntl {...}`（语法错误，整文件无法编译）。
    // 故需同时识别 default，并把删除范围扩到 default 末尾、HOC 导出改用 `export default`。
    const defaultModifier = classNode.modifiers?.find(
      (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
    );
    const tempClassName = `${className}${HOC_CLASS_SUFFIX}`;

    if (classNode.name) {
      if (exportModifier) {
        // 删除 `export `（具名导出）或 `export default `（默认导出，含 default 关键字）
        const removeEnd = defaultModifier
          ? defaultModifier.getEnd() + 1
          : exportModifier.getEnd() + 1;
        transformations.push({
          start: exportModifier.getStart(sourceFile),
          end: removeEnd,
          text: '',
        });
      }

      transformations.push({
        start: classNode.name.getStart(sourceFile),
        end: classNode.name.getEnd(),
        text: tempClassName,
      });

      const hocWrapper = this.library.generateHOCWrapper(tempClassName);
      let hocStatement: string;
      if (defaultModifier) {
        // 默认导出：还原为 `export default HOC(Inner)`，保持模块默认导出契约不变
        hocStatement = `\n\nexport default ${hocWrapper};`;
      } else if (exportModifier) {
        hocStatement = `\n\nexport const ${className} = ${hocWrapper};`;
      } else {
        hocStatement = `\nconst ${className} = ${hocWrapper};`;
      }

      transformations.push({
        start: classNode.getEnd(),
        end: classNode.getEnd(),
        text: hocStatement,
      });
    }
  }

  /**
   * 类组件是否已被 HOC（injectIntl / withTranslation）包裹——以「本组件作用域内存在
   * this.props.<translationVarName> 访问」为信号。已包裹时只需补方法体解构、不能二次包裹。
   * 用 someWithinComponentScope 在嵌套组件边界停止，避免把内层组件的 this.props.t 误算到外层。
   */
  private classAlreadyWrappedByHOC(node: ts.Node, _sourceFile: ts.SourceFile): boolean {
    const varName = this.library.translationVarName;
    return ReactASTUtils.someWithinComponentScope(node, (n) => {
      return (
        ts.isPropertyAccessExpression(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === varName &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.name) &&
        n.expression.name.text === 'props' &&
        n.expression.expression.kind === ts.SyntaxKind.ThisKeyword
      );
    });
  }

  /**
   * 在类组件中「使用了翻译变量」的方法体内注入 `const { <var> } = this.props;`。
   * 供两条路径复用：完整 HOC 注入（injectHOC 步骤 3）与「已被 HOC 包裹仅补解构」路径。
   * bodyDestructuresProp 防止与已有解构重复声明；表达式体箭头成员会被包成块体后注入。
   */
  private injectClassMethodDestructure(
    classNode: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    transformations: Transformation[],
  ): void {
    const varName = this.library.translationVarName;
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
        const usesTranslation = this.library.componentUsesTranslation(body, sourceFile);
        const hasDeclaration = this.bodyDestructuresProp(body, varName);

        if (usesTranslation && !hasDeclaration) {
          if (ts.isBlock(body)) {
            const injectionPos = body.getStart(sourceFile) + 1;
            transformations.push({
              start: injectionPos,
              end: injectionPos,
              text: `\n    const { ${varName} } = this.props;\n`,
            });
          } else if (
            ts.isPropertyDeclaration(member) &&
            member.initializer &&
            ts.isArrowFunction(member.initializer)
          ) {
            // 表达式体箭头类成员（`foo = () => t('x')`）无 Block：transformer 已把字面量
            // 替换为裸 t()/intl 引用，若不注入解构则运行时 `t is not defined`。与 injectHook
            // 的表达式体处理对称，把体包成块体并注入 this.props 解构。
            const start = body.getStart(sourceFile);
            const end = body.getEnd();
            transformations.push({
              start,
              end: start,
              text: `{\n    const { ${varName} } = this.props;\n    return `,
            });
            transformations.push({
              start: end,
              end,
              text: `;\n  }`,
            });
          }
        }
      }
    }
  }

  /**
   * 方法体内是否已从 `this.props` 解构出 varName。
   *
   * 取代脆弱的固定字符串 `includes('const { t } = this.props')` 匹配：后者只认单变量、
   * 单空格的精确写法，对 `const { t, data } = this.props`、`const {t} = this.props` 等
   * 合法形态一律漏判，导致在同一块作用域内重复注入 `const { t } = this.props`，块级
   * 重复声明 t/intl → TS2451 不可编译。改用 AST：扫描体内任意「ObjectBindingPattern =
   * this.props」且绑定名（而非源属性名）等于 varName 的声明。
   *
   * 注意比对的是 BindingElement.name（引入作用域的标识符），而非 propertyName：
   * `const { t: tt } = this.props` 引入的是 tt 而非 t，不构成对 t 的重复声明。
   */
  private bodyDestructuresProp(body: ts.Block | ts.ConciseBody, varName: string): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isPropertyAccessExpression(node.initializer) &&
        node.initializer.expression.kind === ts.SyntaxKind.ThisKeyword &&
        node.initializer.name.text === 'props' &&
        ts.isObjectBindingPattern(node.name)
      ) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name) && element.name.text === varName) {
            found = true;
            return;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return found;
  }

  private applyTransformations(code: string, transformations: Transformation[]): string {
    transformations.sort((a, b) => b.start - a.start);
    let result = code;
    for (const { start, end, text } of transformations) {
      result = result.slice(0, start) + text + result.slice(end);
    }
    return result;
  }
}
