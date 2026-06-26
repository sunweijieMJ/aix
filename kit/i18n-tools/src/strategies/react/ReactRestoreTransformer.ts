import fs from 'fs';
import ts from 'typescript';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import { ReactImportManager, HOC_CLASS_SUFFIX } from './ReactImportManager';
import { ReactTextExtractor } from './ReactTextExtractor';
import type { MessageInfo, TransformContext, LocaleMap } from '../../utils/types';
import type { IRestoreTransformer } from '../../adapters/FrameworkAdapter';
import type { ReactI18nLibrary } from './libraries';

// 内联的最小校验：消息必须含 id 或 defaultMessage 之一，否则无法用于翻译查找
const isValidMessage = (m: MessageInfo): boolean =>
  m.id !== undefined || m.defaultMessage !== undefined;

/**
 * React 还原代码转换器
 * 负责将国际化代码还原为原始文本（由 library 适配器驱动）
 */
export class ReactRestoreTransformer implements IRestoreTransformer {
  private library: ReactI18nLibrary;
  private tImport: string;

  // 与 VueRestoreTransformer 保持一致的 (library, tImport) 顺序。tImport 默认值
  // 由配置层（ReactAdapter）决定，不在策略类中提供，避免双源默认值漂移。
  constructor(library: ReactI18nLibrary, tImport: string) {
    this.library = library;
    this.tImport = tImport;
  }

  /**
   * locale 值归一：双花括号占位符 → 单花括号（i18next 系库），再 unescape 字面量花括号。
   * 与写盘的 finalizeLocaleMessage 对称。
   */
  private static normalizeLocaleMap(localeMap: LocaleMap, library: ReactI18nLibrary): LocaleMap {
    const result: LocaleMap = {};
    for (const [key, value] of Object.entries(localeMap)) {
      if (typeof value !== 'string') {
        result[key] = value;
        continue;
      }
      const single = library.usesDoubleBracePlaceholders
        ? CommonASTUtils.toSingleBracePlaceholders(value)
        : value;
      result[key] = library.unescapeLiteralText(single);
    }
    return result;
  }

  transform(filePath: string, localeMap: LocaleMap): string {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = CommonASTUtils.parseSourceFile(sourceText, filePath);

    // locale 值归一：i18next 系库双花括号 → 单花括号；并 unescape 写盘时转义的字面量花括号。
    const normalizedLocaleMap = ReactRestoreTransformer.normalizeLocaleMap(localeMap, this.library);

    const context: TransformContext = {
      localeMap: normalizedLocaleMap,
      definedMessages: new Map(),
      hasChanges: false,
      sourceFile,
      componentNameMap: new Map(),
      exportedHocInnerNames: new Set(),
      defaultExportedHocInnerNames: new Set(),
    };

    // 提取 defineMessages 中的消息定义
    ts.forEachChild(sourceFile, function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        ReactTextExtractor.extractDefineMessages(node, context.definedMessages, sourceFile);
      }
      ts.forEachChild(node, visit);
    });

    // 应用转换
    const transformer = this.createTransformer(context);
    const result = ts.transform(sourceFile, [transformer]);

    if (!context.hasChanges) {
      return sourceText;
    }

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    let transformedCode = printer.printFile(result.transformed[0]!);
    // React 端 includeJsx=true：处理 `{'...'}` 形式的 JSX 表达式包裹
    transformedCode = CommonASTUtils.convertUnicodeToChineseInCode(transformedCode, true);

    result.dispose();

    // 收尾：删除 restore 后已无引用的 tImport `t` 导入（与 generate 侧 finalizeImports 对称）。
    // 保守守卫：仅当 t 在还原后的整文件中已无任何引用时删除——若存在「locale 查不到、未被还原」
    // 的存活 t() 调用，t 仍被使用，必须保留 import，否则产出 `Cannot find name 't'`（TS2304）。
    transformedCode = this.finalizeTImport(transformedCode, filePath);

    return transformedCode;
  }

  /**
   * restore 收尾：tImport 的全局函数 `t` 在还原后若已无任何引用，则删除其 import
   * （独占则删整条，混合则仅摘 t、保留同路径其他命名）。
   *
   * 用 isImportedNameUnused 守卫：还原后 hook 声明已被清理、不存在遮蔽，故「仍有 t 引用」
   * 必然是存活的 t() 调用（locale 查不到、未被还原），此时必须保留 import。与 generate 侧
   * ReactImportManager.finalizeImports 对称——一个防死导入，一个防误删仍用的导入。
   */
  private finalizeTImport(code: string, filePath: string): string {
    const funcName = this.library.globalFunctionName.split('.')[0]!;
    if (!CommonASTUtils.isImportedNameUnused(code, filePath, this.tImport, funcName)) {
      return code;
    }
    return CommonASTUtils.removeNamedImports(code, (m) => m === this.tImport, [funcName]);
  }

  /**
   * 转换翻译函数调用
   */
  private transformTranslationCall(
    node: ts.CallExpression,
    localeMap: Record<string, string>,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): ts.Node | null {
    if (!this.library.isTranslationCall(node)) {
      return null;
    }

    const messageInfo = this.library.extractCallInfo(node, definedMessages, sourceFile);
    if (!isValidMessage(messageInfo)) {
      return null;
    }

    const messageTemplate = messageInfo.id ? localeMap[messageInfo.id] : undefined;
    const templateToUse = messageTemplate ?? messageInfo.defaultMessage;
    if (templateToUse === undefined) {
      return null;
    }

    return CommonASTUtils.createStringOrTemplateNode(templateToUse, messageInfo.values);
  }

  /**
   * 转换翻译 JSX 组件
   *
   * @param inJsxChildContext - 调用方是否处于 JsxElement.children 位置。
   *   - true: 返回 JsxText（JSX children 合法）；
   *   - false: 返回 StringLiteral（适用于 JsxAttribute={<Trans />} 等表达式位置，
   *            JsxText 在此处会产生非法 AST）。
   */
  private transformTranslationComponent(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    localeMap: Record<string, string>,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
    inJsxChildContext: boolean,
  ): ts.Node | null {
    const openingElement = ts.isJsxElement(node) ? node.openingElement : node;

    if (
      !ts.isIdentifier(openingElement.tagName) ||
      !this.library.isTranslationComponent(openingElement.tagName.text)
    ) {
      return null;
    }

    const messageInfo = this.library.extractJSXInfo(openingElement, definedMessages, sourceFile);
    if (!isValidMessage(messageInfo)) {
      return null;
    }

    const messageTemplate = messageInfo.id ? localeMap[messageInfo.id] : undefined;
    const finalText = messageTemplate ?? messageInfo.defaultMessage ?? '';

    if (messageInfo.values && Object.keys(messageInfo.values).length > 0) {
      // JSX 子节点位置：重建为 JSX 片段 `<>文本 {expr} 文本</>`，避免把模板字面量
      // (`` `文本 ${expr}` ``)当作字面文本渲染。非 JSX 位置(如 attr={<Trans/>})
      // 仍用模板字面量。
      if (inJsxChildContext) {
        const fragment = CommonASTUtils.createJsxFragmentFromTemplate(
          finalText,
          messageInfo.values,
        );
        if (fragment) return fragment;
      }
      return CommonASTUtils.createStringOrTemplateNode(finalText, messageInfo.values);
    }

    return inJsxChildContext
      ? ts.factory.createJsxText(finalText, false)
      : ts.factory.createStringLiteral(finalText);
  }

  /**
   * 创建 AST 转换器
   */
  private createTransformer(context: TransformContext): ts.TransformerFactory<ts.SourceFile> {
    const library = this.library;

    // 预备遍历，收集 HOC 组件的名称映射
    function prepass(node: ts.Node) {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isIdentifier(node.name) && node.initializer) {
          const wrappedComponent = library.getHOCWrappedComponent(node.initializer);
          if (wrappedComponent) {
            context.componentNameMap.set(node.name.text, wrappedComponent);
            // 类组件 HOC 约定：内部类名 = 原名 + 'WithOutIntl'。若该 HOC 导出语句带 export，
            // 记录内部类名，供 unwrapHOC 把类改回原名时恢复 export（Bug B3）。
            if (
              wrappedComponent === node.name.text + HOC_CLASS_SUFFIX &&
              ts.isVariableDeclarationList(node.parent) &&
              ts.isVariableStatement(node.parent.parent) &&
              node.parent.parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
            ) {
              context.exportedHocInnerNames!.add(wrappedComponent);
            }
          }
        }
      }
      // `export default HOC(FooWithOutIntl)`：记录内部类名，供 unwrapHOC 删除该默认导出语句、
      // 并在类改回原名时恢复 `export default`（Bug #1 的 restore 配套）。
      if (
        ts.isExportAssignment(node) &&
        !node.isExportEquals &&
        ts.isCallExpression(node.expression)
      ) {
        const wrappedComponent = library.getHOCWrappedComponent(node.expression);
        if (wrappedComponent && wrappedComponent.endsWith(HOC_CLASS_SUFFIX)) {
          context.defaultExportedHocInnerNames!.add(wrappedComponent);
        }
      }
      ts.forEachChild(node, prepass);
    }
    prepass(context.sourceFile);

    return (transformationContext: ts.TransformationContext) => {
      // 父节点栈：判断当前 visit 节点是否在 JsxElement.children 位置；
      // 在 JsxAttribute / JsxExpression 内部时不能用 JsxText 替换 SelfClosingElement。
      const parentStack: ts.Node[] = [];

      const visit = (node: ts.Node): ts.Node | ts.Node[] => {
        const parent = parentStack[parentStack.length - 1];
        const inJsxChildContext =
          parent !== undefined && (ts.isJsxElement(parent) || ts.isJsxFragment(parent));
        let currentNode = node;

        // 1. 重命名组件引用
        currentNode = ReactImportManager.renameComponent(currentNode, context);
        if (currentNode !== node) context.hasChanges = true;

        // 2. 解除 HOC
        currentNode = ReactImportManager.unwrapHOC(currentNode, context, library);
        if (currentNode !== node) context.hasChanges = true;

        // 3. 清理 HOC Props 类型引用
        currentNode = ReactImportManager.cleanupHOCPropsType(currentNode, library);
        if (currentNode !== node) context.hasChanges = true;

        let nodeChanged = false;

        // 转换翻译函数调用
        if (ts.isCallExpression(currentNode)) {
          const transformedNode = this.transformTranslationCall(
            currentNode,
            context.localeMap,
            context.definedMessages,
            context.sourceFile,
          );
          if (transformedNode) {
            context.hasChanges = true;
            currentNode = transformedNode;
            nodeChanged = true;
          }
        }

        // 处理对象字面量中的翻译调用
        if (ts.isObjectLiteralExpression(currentNode)) {
          const transformedProperties: ts.ObjectLiteralElementLike[] = [];
          let objectChanged = false;

          for (const prop of currentNode.properties) {
            if (ts.isPropertyAssignment(prop)) {
              let newInitializer = prop.initializer;

              if (ts.isCallExpression(prop.initializer)) {
                const transformedCall = this.transformTranslationCall(
                  prop.initializer,
                  context.localeMap,
                  context.definedMessages,
                  context.sourceFile,
                );
                if (transformedCall && ts.isExpression(transformedCall)) {
                  newInitializer = transformedCall;
                  objectChanged = true;
                }
              }

              if (newInitializer !== prop.initializer) {
                transformedProperties.push(
                  ts.factory.createPropertyAssignment(prop.name, newInitializer),
                );
              } else {
                transformedProperties.push(prop);
              }
            } else {
              transformedProperties.push(prop);
            }
          }

          if (objectChanged) {
            context.hasChanges = true;
            currentNode = ts.factory.createObjectLiteralExpression(transformedProperties);
            nodeChanged = true;
          }
        }

        if (!nodeChanged) {
          // 转换翻译 JSX 组件
          if (ts.isJsxElement(currentNode) || ts.isJsxSelfClosingElement(currentNode)) {
            const transformedNode = this.transformTranslationComponent(
              currentNode,
              context.localeMap,
              context.definedMessages,
              context.sourceFile,
              inJsxChildContext,
            );
            if (transformedNode) {
              context.hasChanges = true;
              currentNode = transformedNode;
            }
          }

          // 清理导入（仅整条移除 i18n 库 import；tImport 的 t 延后到收尾 pass 带守卫处理）
          if (ts.isImportDeclaration(currentNode)) {
            const cleanedNode = ReactImportManager.cleanupImports(currentNode, library);
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
            }
          }

          // 清理变量声明
          if (ts.isVariableStatement(currentNode)) {
            const cleanedNode = ReactImportManager.cleanupVariableStatements(currentNode, library);
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
            }
          }

          // 清理Hook依赖数组
          if (ts.isCallExpression(currentNode)) {
            const cleanedNode = ReactImportManager.cleanupHookDependencies(currentNode, library);
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
            }
          }
        }

        parentStack.push(currentNode);
        const result = ts.visitEachChild(currentNode, visit, transformationContext);
        parentStack.pop();
        return result;
      };

      return (sourceFile: ts.SourceFile) => ts.visitNode(sourceFile, visit) as ts.SourceFile;
    };
  }
}
