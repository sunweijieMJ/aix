import fs from 'fs';
import ts from 'typescript';
import { ASTUtils } from '../../utils/ast/ASTUtils';
import { ReactImportManager } from './ReactImportManager';
import { ReactTextExtractor } from './ReactTextExtractor';
import { MessageProcessor } from '../../utils/message-processor';
import type {
  MessageInfo,
  TransformContext,
  LocaleMap,
} from '../../utils/types';

import type { IRestoreTransformer } from '../../adapters/FrameworkAdapter';
import type { ReactI18nLibrary } from './libraries';

/**
 * React 还原代码转换器
 * 负责将国际化代码还原为原始文本（由 library 适配器驱动）
 */
export class ReactRestoreTransformer implements IRestoreTransformer {
  private tImport: string;
  private library: ReactI18nLibrary;

  constructor(tImport: string = '@/plugins/locale', library: ReactI18nLibrary) {
    this.tImport = tImport;
    this.library = library;
  }

  transform(filePath: string, localeMap: LocaleMap): string {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ASTUtils.parseSourceFile(sourceText, filePath);

    const context: TransformContext = {
      localeMap,
      definedMessages: new Map(),
      hasChanges: false,
      sourceFile,
      componentNameMap: new Map(),
    };

    // 提取 defineMessages 中的消息定义
    ts.forEachChild(sourceFile, function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        ReactTextExtractor.extractDefineMessages(
          node,
          context.definedMessages,
          sourceFile,
        );
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
    transformedCode =
      ReactImportManager.convertUnicodeToChineseInCode(transformedCode);

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

    const messageInfo = this.extractTranslationCallInfo(
      node,
      definedMessages,
      sourceFile,
    );
    if (!MessageProcessor.isValidMessage(messageInfo)) {
      return null;
    }

    const messageTemplate = messageInfo.id
      ? localeMap[messageInfo.id]
      : undefined;
    const templateToUse = messageTemplate ?? messageInfo.defaultMessage;
    if (templateToUse === undefined) {
      return null;
    }

    return ASTUtils.createStringOrTemplateNode(
      templateToUse,
      messageInfo.values,
    );
  }

  /**
   * 提取翻译调用的信息（根据 library 类型分发）
   */
  private extractTranslationCallInfo(
    node: ts.CallExpression,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo {
    // react-intl: intl.formatMessage({ id: 'key' }, { values })
    if (this.library.packageName === 'react-intl') {
      return ASTUtils.extractFormatMessageInfo(
        node,
        definedMessages,
        sourceFile,
      );
    }

    // react-i18next: t('key', { values }) 或 t('namespace:key', { values })
    const arg = node.arguments[0];
    if (!arg) return {};

    const messageInfo: MessageInfo = {};

    if (ts.isStringLiteral(arg)) {
      let id = arg.text;
      // 剥离 namespace 前缀 (如 'common:button.submit' → 'button.submit')
      const colonIndex = id.indexOf(':');
      if (colonIndex !== -1) {
        id = id.substring(colonIndex + 1);
      }
      messageInfo.id = id;
    }

    const valuesArg = node.arguments[1];
    if (valuesArg && ts.isObjectLiteralExpression(valuesArg)) {
      const props: Record<string, string> = {};
      for (const prop of valuesArg.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const name = prop.name.text;
          if (name === 'defaultValue') {
            messageInfo.defaultMessage = ts.isStringLiteral(prop.initializer)
              ? prop.initializer.text
              : undefined;
          } else {
            props[name] = prop.initializer.getText(sourceFile);
          }
        }
      }
      if (Object.keys(props).length > 0) {
        messageInfo.values = props;
      }
    }

    return messageInfo;
  }

  /**
   * 转换翻译 JSX 组件
   */
  private transformTranslationComponent(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    localeMap: Record<string, string>,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): ts.Node | null {
    const openingElement = ts.isJsxElement(node) ? node.openingElement : node;

    if (
      !ts.isIdentifier(openingElement.tagName) ||
      !this.library.isTranslationComponent(openingElement.tagName.text)
    ) {
      return null;
    }

    const messageInfo = this.extractJSXComponentInfo(
      openingElement,
      definedMessages,
      sourceFile,
    );
    if (!MessageProcessor.isValidMessage(messageInfo)) {
      return null;
    }

    const messageTemplate = messageInfo.id
      ? localeMap[messageInfo.id]
      : undefined;
    const finalText = messageTemplate ?? messageInfo.defaultMessage ?? '';

    if (messageInfo.values && Object.keys(messageInfo.values).length > 0) {
      return ASTUtils.createStringOrTemplateNode(finalText, messageInfo.values);
    }

    return ts.factory.createJsxText(finalText, false);
  }

  /**
   * 提取 JSX 组件的信息（根据 library 类型分发）
   */
  private extractJSXComponentInfo(
    openingElement: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    definedMessages: Map<string, MessageInfo>,
    sourceFile: ts.SourceFile,
  ): MessageInfo {
    // react-intl: <FormattedMessage id="key" defaultMessage="text" values={{ }} />
    if (this.library.packageName === 'react-intl') {
      return ASTUtils.extractFormattedMessageInfo(
        openingElement,
        definedMessages,
        sourceFile,
      );
    }

    // react-i18next: <Trans i18nKey="key" defaults="text" values={{ }} />
    const messageInfo: MessageInfo = {};
    for (const attribute of openingElement.attributes.properties) {
      if (ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name)) {
        const attrName = attribute.name.text;
        if (attrName === 'i18nKey' && attribute.initializer) {
          if (ts.isStringLiteral(attribute.initializer)) {
            let id = attribute.initializer.text;
            // 剥离 namespace 前缀
            const colonIndex = id.indexOf(':');
            if (colonIndex !== -1) {
              id = id.substring(colonIndex + 1);
            }
            messageInfo.id = id;
          }
        } else if (attrName === 'defaults' && attribute.initializer) {
          if (ts.isStringLiteral(attribute.initializer)) {
            messageInfo.defaultMessage = attribute.initializer.text;
          }
        } else if (attrName === 'values' && attribute.initializer) {
          if (
            ts.isJsxExpression(attribute.initializer) &&
            attribute.initializer.expression &&
            ts.isObjectLiteralExpression(attribute.initializer.expression)
          ) {
            const props: Record<string, string> = {};
            for (const prop of attribute.initializer.expression.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                props[prop.name.text] = prop.initializer.getText(sourceFile);
              }
            }
            messageInfo.values = props;
          }
        }
      }
    }
    return messageInfo;
  }

  /**
   * 创建 AST 转换器
   */
  private createTransformer(
    context: TransformContext,
  ): ts.TransformerFactory<ts.SourceFile> {
    const library = this.library;
    const tImport = this.tImport;

    // 预备遍历，收集 HOC 组件的名称映射
    function prepass(node: ts.Node) {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isIdentifier(node.name) && node.initializer) {
          const wrappedComponent = library.getHOCWrappedComponent(
            node.initializer,
          );
          if (wrappedComponent) {
            context.componentNameMap.set(node.name.text, wrappedComponent);
          }
        }
      }
      ts.forEachChild(node, prepass);
    }
    prepass(context.sourceFile);

    return (transformationContext: ts.TransformationContext) => {
      const visit = (node: ts.Node): ts.Node | ts.Node[] => {
        let currentNode = node;

        // 1. 重命名组件引用
        currentNode = ReactImportManager.renameComponent(currentNode, context);
        if (currentNode !== node) context.hasChanges = true;

        // 2. 解除 HOC
        currentNode = ReactImportManager.unwrapHOC(
          currentNode,
          context,
          library,
        );
        if (currentNode !== node) context.hasChanges = true;

        // 3. 清理 HOC Props 类型引用
        currentNode = ReactImportManager.cleanupHOCPropsType(
          currentNode,
          library,
        );
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
                  ts.factory.createPropertyAssignment(
                    prop.name,
                    newInitializer,
                  ),
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
            currentNode = ts.factory.createObjectLiteralExpression(
              transformedProperties,
            );
            nodeChanged = true;
          }
        }

        if (!nodeChanged) {
          // 转换翻译 JSX 组件
          if (
            ts.isJsxElement(currentNode) ||
            ts.isJsxSelfClosingElement(currentNode)
          ) {
            const transformedNode = this.transformTranslationComponent(
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

          // 清理导入
          if (ts.isImportDeclaration(currentNode)) {
            const cleanedNode = ReactImportManager.cleanupImports(
              currentNode,
              tImport,
              library,
            );
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
              nodeChanged = true;
            }
          }

          // 清理变量声明
          if (ts.isVariableStatement(currentNode)) {
            const cleanedNode = ReactImportManager.cleanupVariableStatements(
              currentNode,
              library,
            );
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
              nodeChanged = true;
            }
          }

          // 清理Hook依赖数组
          if (ts.isCallExpression(currentNode)) {
            const cleanedNode = ReactImportManager.cleanupHookDependencies(
              currentNode,
              library,
            );
            if (cleanedNode !== currentNode) {
              context.hasChanges = true;
              currentNode = cleanedNode;
              nodeChanged = true;
            }
          }
        }

        return ts.visitEachChild(currentNode, visit, transformationContext);
      };

      return (sourceFile: ts.SourceFile) =>
        ts.visitNode(sourceFile, visit) as ts.SourceFile;
    };
  }
}
