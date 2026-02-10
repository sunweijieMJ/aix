import fs from 'fs';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import { ASTUtils } from '../../utils/ast/ASTUtils';
import { VueImportManager } from './VueImportManager';
import type { LocaleMap, TransformContext } from '../../utils/types';
import type { IRestoreTransformer } from '../../adapters/FrameworkAdapter';
import type { VueI18nLibrary } from './libraries';
import { VueI18nLibraryImpl } from './libraries';

/**
 * Vue 还原代码转换器
 * 负责将 i18n 调用还原为原始文本
 */
export class VueRestoreTransformer implements IRestoreTransformer {
  private library: VueI18nLibrary;

  constructor(library?: VueI18nLibrary) {
    this.library = library ?? new VueI18nLibraryImpl();
  }

  /**
   * 转换文件（实现接口方法）
   */
  transform(filePath: string, localeMap: LocaleMap): string {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    return VueRestoreTransformer.restoreVueFile(
      sourceText,
      localeMap,
      this.library,
    );
  }

  /**
   * 还原 Vue 文件
   */
  static restoreVueFile(
    sourceText: string,
    localeMap: Record<string, string>,
    library?: VueI18nLibrary,
  ): string {
    const lib = library ?? new VueI18nLibraryImpl();
    const { descriptor } = parseSFC(sourceText);

    let restoredCode = sourceText;

    // 还原 template 部分
    // 使用 SFC 解析器返回的 content 精确替换，避免正则在嵌套 template 场景下匹配错误
    if (descriptor.template) {
      const restoredTemplate = this.restoreTemplate(
        descriptor.template.content,
        localeMap,
        lib,
      );
      if (restoredTemplate !== descriptor.template.content) {
        restoredCode = restoredCode.replace(
          descriptor.template.content,
          restoredTemplate,
        );
      }
    }

    // 还原 script 部分
    // 使用 SFC 解析器返回的 content 精确替换，避免正则在多 script 块场景下匹配错误
    const script = descriptor.scriptSetup || descriptor.script;
    if (script) {
      const restoredScript = this.restoreScript(script.content, localeMap, lib);
      if (restoredScript !== script.content) {
        restoredCode = restoredCode.replace(script.content, restoredScript);
      }
    }

    // 清理导入
    restoredCode = this.cleanupImports(restoredCode, lib);

    return restoredCode;
  }

  /**
   * 还原 template 中的 i18n 调用
   */
  private static restoreTemplate(
    templateContent: string,
    localeMap: Record<string, string>,
    library: VueI18nLibrary,
  ): string {
    let restored = templateContent;

    // 匹配 {{ $t('key') }} 或 {{ t('key') }} 或 {{ $t('key', { vars }) }}
    const i18nCallRegex =
      /\{\{\s*\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]+\}))?\s*\)\s*\}\}/g;

    restored = restored.replace(i18nCallRegex, (match, key, vars) => {
      // 如果是 vue-i18next 且有命名空间前缀，去掉命名空间
      let lookupKey = key as string;
      if (library.supportsNamespace) {
        const colonIndex = lookupKey.indexOf(':');
        if (colonIndex !== -1) {
          lookupKey = lookupKey.substring(colonIndex + 1);
        }
      }

      const text = localeMap[lookupKey] || localeMap[key];
      if (!text) {
        return match;
      }

      if (vars) {
        try {
          return this.restoreTemplateWithVariables(text, vars as string);
        } catch {
          return text;
        }
      }

      return text;
    });

    return restored;
  }

  /**
   * 还原带变量的模板字符串
   */
  private static restoreTemplateWithVariables(
    text: string,
    vars: string,
  ): string {
    const varMap = new Map<string, string>();
    const varMatches = vars.matchAll(/(\w+):\s*([^,}]+)/g);
    for (const [, key, value] of varMatches) {
      varMap.set(key!.trim(), value!.trim());
    }

    let result = text;
    varMap.forEach((expression, placeholder) => {
      const placeholderPattern = new RegExp(`\\{${placeholder}\\}`, 'g');
      result = result.replace(placeholderPattern, `{{ ${expression} }}`);
    });

    return result;
  }

  /**
   * 还原 script 中的 i18n 调用
   */
  private static restoreScript(
    scriptContent: string,
    localeMap: Record<string, string>,
    library: VueI18nLibrary,
  ): string {
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      scriptContent,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const context: TransformContext = {
      sourceFile,
      localeMap,
      definedMessages: new Map(),
      componentNameMap: new Map(),
      hasChanges: false,
    };

    const transformer = this.createScriptTransformer(context, library);
    const result = ts.transform(sourceFile, [transformer]);
    const transformedSourceFile = result.transformed[0];

    if (!context.hasChanges) {
      return scriptContent;
    }

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    let restoredScript = printer.printFile(transformedSourceFile!);

    // 清理 Hook 相关声明
    restoredScript = this.cleanupHookDeclarations(restoredScript, library);

    // 转换 Unicode 编码为中文
    restoredScript =
      VueImportManager.convertUnicodeToChineseInCode(restoredScript);

    result.dispose();
    return restoredScript;
  }

  /**
   * 创建 script 转换器
   */
  private static createScriptTransformer(
    context: TransformContext,
    library: VueI18nLibrary,
  ): ts.TransformerFactory<ts.SourceFile> {
    return (transformationContext: ts.TransformationContext) => {
      const visit = (node: ts.Node): ts.Node => {
        let currentNode = node;

        // 转换 t() 或 $t() 调用
        if (ts.isCallExpression(currentNode)) {
          const transformedNode = this.transformI18nCall(
            currentNode,
            context.localeMap,
            context.sourceFile,
            library,
          );
          if (transformedNode) {
            context.hasChanges = true;
            currentNode = transformedNode;
          }
        }

        // 清理导入
        if (ts.isImportDeclaration(currentNode)) {
          const cleanedNode = VueImportManager.cleanupImports(
            currentNode,
            library,
          );
          if (cleanedNode !== currentNode) {
            context.hasChanges = true;
            currentNode = cleanedNode;
          }
        }

        // 清理变量声明
        if (ts.isVariableStatement(currentNode)) {
          const cleanedNode = VueImportManager.cleanupVariableStatements(
            currentNode,
            library,
          );
          if (cleanedNode !== currentNode) {
            context.hasChanges = true;
            currentNode = cleanedNode;
          }
        }

        return ts.visitEachChild(currentNode, visit, transformationContext);
      };

      return (sourceFile: ts.SourceFile) =>
        ts.visitNode(sourceFile, visit) as ts.SourceFile;
    };
  }

  /**
   * 转换 t() 或 $t() 调用
   */
  private static transformI18nCall(
    node: ts.CallExpression,
    localeMap: Record<string, string>,
    sourceFile: ts.SourceFile,
    library: VueI18nLibrary,
  ): ts.Node | null {
    const expression = node.expression;
    let isTCall = false;

    if (ts.isIdentifier(expression) && expression.text === 't') {
      isTCall = true;
    } else if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.name) &&
      expression.name.text === '$t'
    ) {
      isTCall = true;
    }

    if (!isTCall || node.arguments.length === 0) {
      return null;
    }

    const keyArg = node.arguments[0]!;
    if (!ts.isStringLiteral(keyArg)) {
      return null;
    }

    let key = keyArg.text;

    // 如果是 vue-i18next 且有命名空间前缀，去掉命名空间
    if (library.supportsNamespace) {
      const colonIndex = key.indexOf(':');
      if (colonIndex !== -1) {
        key = key.substring(colonIndex + 1);
      }
    }

    const text = localeMap[key] || localeMap[keyArg.text];

    if (!text) {
      return null;
    }

    // 检查是否有第二个参数（变量对象）
    if (node.arguments.length > 1) {
      const varsArg = node.arguments[1]!;
      if (ts.isObjectLiteralExpression(varsArg)) {
        const values: Record<string, string> = {};
        for (const prop of varsArg.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const propName = prop.name.text;
            const propValue = ASTUtils.nodeToText(prop.initializer, sourceFile);
            values[propName] = propValue;
          }
        }

        return ASTUtils.createStringOrTemplateNode(text, values);
      }
    }

    return ts.factory.createStringLiteral(text);
  }

  /**
   * 清理导入语句
   */
  private static cleanupImports(code: string, library: VueI18nLibrary): string {
    return code.replace(library.getImportCleanupRegex(), '');
  }

  /**
   * 清理 Hook 相关声明
   */
  private static cleanupHookDeclarations(
    code: string,
    library: VueI18nLibrary,
  ): string {
    return code.replace(library.getHookDeclarationCleanupRegex(), '');
  }
}
