import fs from 'fs';
import ts from 'typescript';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import { ReactImportManager } from './ReactImportManager';
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

  /** 把 locale 文本中的双花括号占位符归一回单花括号（i18next 系库 restore 用） */
  private static normalizeLocaleMap(localeMap: LocaleMap): LocaleMap {
    const result: LocaleMap = {};
    for (const [key, value] of Object.entries(localeMap)) {
      result[key] =
        typeof value === 'string' ? CommonASTUtils.toSingleBracePlaceholders(value) : value;
    }
    return result;
  }

  transform(filePath: string, localeMap: LocaleMap): string {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = CommonASTUtils.parseSourceFile(sourceText, filePath);

    // i18next 系库 locale 用双花括号占位符，先归一回内部规范的单花括号，
    // 复用既有的 createStringOrTemplateNode 单花括号还原逻辑。
    const normalizedLocaleMap = this.library.usesDoubleBracePlaceholders
      ? ReactRestoreTransformer.normalizeLocaleMap(localeMap)
      : localeMap;

    const context: TransformContext = {
      localeMap: normalizedLocaleMap,
      definedMessages: new Map(),
      hasChanges: false,
      sourceFile,
      componentNameMap: new Map(),
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

    return transformedCode;
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
    const tImport = this.tImport;

    // 预备遍历，收集 HOC 组件的名称映射
    function prepass(node: ts.Node) {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isIdentifier(node.name) && node.initializer) {
          const wrappedComponent = library.getHOCWrappedComponent(node.initializer);
          if (wrappedComponent) {
            context.componentNameMap.set(node.name.text, wrappedComponent);
          }
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
        const inJsxChildContext = parent !== undefined && ts.isJsxElement(parent);
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

          // 清理导入
          if (ts.isImportDeclaration(currentNode)) {
            const cleanedNode = ReactImportManager.cleanupImports(currentNode, tImport, library);
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
