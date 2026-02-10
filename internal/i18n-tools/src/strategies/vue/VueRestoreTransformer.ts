import fs from 'fs';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import { ASTUtils } from '../../utils/ast/ASTUtils';
import { VueImportManager } from './VueImportManager';
import type { LocaleMap, TransformContext } from '../../utils/types';
import type { IRestoreTransformer } from '../../adapters/FrameworkAdapter';

/**
 * Vue 还原代码转换器
 * 负责将 vue-i18n 调用还原为原始文本
 */
export class VueRestoreTransformer implements IRestoreTransformer {
  /**
   * 转换文件（实现接口方法）
   * @param filePath - 文件路径
   * @param localeMap - 语言映射
   * @returns 转换后的代码
   */
  transform(filePath: string, localeMap: LocaleMap): string {
    // 读取文件内容
    const sourceText = fs.readFileSync(filePath, 'utf-8');

    // 调用静态方法进行还原
    return VueRestoreTransformer.restoreVueFile(sourceText, localeMap);
  }

  /**
   * 还原 Vue 文件
   * @param sourceText - 源代码
   * @param localeMap - 语言映射
   * @returns 还原后的代码
   */
  static restoreVueFile(
    sourceText: string,
    localeMap: Record<string, string>,
  ): string {
    // 解析 .vue 文件
    const { descriptor } = parseSFC(sourceText);

    let restoredCode = sourceText;

    // 还原 template 部分
    if (descriptor.template) {
      const restoredTemplate = this.restoreTemplate(
        descriptor.template.content,
        localeMap,
      );
      const templateMatch = restoredCode.match(
        /<template>([\s\S]*?)<\/template>/,
      );
      if (templateMatch) {
        restoredCode = restoredCode.replace(
          templateMatch[1]!,
          restoredTemplate,
        );
      }
    }

    // 还原 script 部分
    const script = descriptor.scriptSetup || descriptor.script;
    if (script) {
      const restoredScript = this.restoreScript(script.content, localeMap);
      const scriptMatch = restoredCode.match(
        /<script[^>]*>([\s\S]*?)<\/script>/,
      );
      if (scriptMatch) {
        restoredCode = restoredCode.replace(scriptMatch[1]!, restoredScript);
      }
    }

    // 清理 vue-i18n 导入
    restoredCode = this.cleanupImports(restoredCode);

    return restoredCode;
  }

  /**
   * 还原 template 中的 i18n 调用
   * @param templateContent - template 内容
   * @param localeMap - 语言映射
   * @returns 还原后的 template 内容
   */
  private static restoreTemplate(
    templateContent: string,
    localeMap: Record<string, string>,
  ): string {
    let restored = templateContent;

    // 匹配 {{ $t('key') }} 或 {{ t('key') }} 或 {{ $t('key', { vars }) }}
    const i18nCallRegex =
      /\{\{\s*\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]+\}))?\s*\)\s*\}\}/g;

    restored = restored.replace(i18nCallRegex, (match, key, vars) => {
      const text = localeMap[key];
      if (!text) {
        return match; // 如果找不到翻译，保持原样
      }

      // 如果有变量，需要处理插值
      if (vars) {
        try {
          // 将 { name: userName } 转换为实际的插值表达式
          return this.restoreTemplateWithVariables(text, vars);
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
   * @param text - 翻译文本（如 "欢迎 {name} 使用系统"）
   * @param vars - 变量对象字符串（如 "{ name: userName }"）
   * @returns 还原后的模板表达式
   */
  private static restoreTemplateWithVariables(
    text: string,
    vars: string,
  ): string {
    // 解析变量对象：{ name: userName } => Map { 'name' => 'userName' }
    const varMap = new Map<string, string>();
    const varMatches = vars.matchAll(/(\w+):\s*([^,}]+)/g);
    for (const [, key, value] of varMatches) {
      varMap.set(key!.trim(), value!.trim());
    }

    // 替换文本中的占位符 {name} 为实际表达式 {{ userName }}
    let result = text;
    varMap.forEach((expression, placeholder) => {
      const placeholderPattern = new RegExp(`\\{${placeholder}\\}`, 'g');
      result = result.replace(placeholderPattern, `{{ ${expression} }}`);
    });

    return result;
  }

  /**
   * 还原 script 中的 i18n 调用
   * @param scriptContent - script 内容
   * @param localeMap - 语言映射
   * @returns 还原后的 script 内容
   */
  private static restoreScript(
    scriptContent: string,
    localeMap: Record<string, string>,
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

    const transformer = this.createScriptTransformer(context);
    const result = ts.transform(sourceFile, [transformer]);
    const transformedSourceFile = result.transformed[0];

    if (!context.hasChanges) {
      return scriptContent;
    }

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    let restoredScript = printer.printFile(transformedSourceFile!);

    // 清理 useI18n 相关声明
    restoredScript = this.cleanupUseI18nDeclarations(restoredScript);

    // 转换 Unicode 编码为中文
    restoredScript =
      VueImportManager.convertUnicodeToChineseInCode(restoredScript);

    result.dispose();
    return restoredScript;
  }

  /**
   * 创建 script 转换器
   * @param context - 转换上下文
   * @returns 转换器工厂函数
   */
  private static createScriptTransformer(
    context: TransformContext,
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
          );
          if (transformedNode) {
            context.hasChanges = true;
            currentNode = transformedNode;
          }
        }

        // 清理导入
        if (ts.isImportDeclaration(currentNode)) {
          const cleanedNode = VueImportManager.cleanupImports(currentNode);
          if (cleanedNode !== currentNode) {
            context.hasChanges = true;
            currentNode = cleanedNode;
          }
        }

        // 清理变量声明
        if (ts.isVariableStatement(currentNode)) {
          const cleanedNode =
            VueImportManager.cleanupVariableStatements(currentNode);
          if (cleanedNode !== currentNode) {
            context.hasChanges = true;
            currentNode = cleanedNode;
          }
        }

        // 继续递归遍历子节点
        return ts.visitEachChild(currentNode, visit, transformationContext);
      };

      return (sourceFile: ts.SourceFile) =>
        ts.visitNode(sourceFile, visit) as ts.SourceFile;
    };
  }

  /**
   * 转换 t() 或 $t() 调用
   * @param node - 调用表达式节点
   * @param localeMap - 语言映射
   * @param sourceFile - 源文件
   * @returns 转换后的节点或 null
   */
  private static transformI18nCall(
    node: ts.CallExpression,
    localeMap: Record<string, string>,
    sourceFile: ts.SourceFile,
  ): ts.Node | null {
    // 检查是否是 t() 或 this.$t() 调用
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

    // 获取第一个参数（key）
    const keyArg = node.arguments[0]!;
    if (!ts.isStringLiteral(keyArg)) {
      return null;
    }

    const key = keyArg.text;
    const text = localeMap[key];

    if (!text) {
      return null; // 如果找不到翻译，保持原样
    }

    // 检查是否有第二个参数（变量对象）
    if (node.arguments.length > 1) {
      const varsArg = node.arguments[1]!;
      if (ts.isObjectLiteralExpression(varsArg)) {
        // 提取变量映射
        const values: Record<string, string> = {};
        for (const prop of varsArg.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const propName = prop.name.text;
            const propValue = ASTUtils.nodeToText(prop.initializer, sourceFile);
            values[propName] = propValue;
          }
        }

        // 创建模板字符串或表达式
        return ASTUtils.createStringOrTemplateNode(text, values);
      }
    }

    // 创建普通字符串字面量
    return ts.factory.createStringLiteral(text);
  }

  /**
   * 清理 vue-i18n 导入
   * @param code - 源代码
   * @returns 清理后的代码
   */
  private static cleanupImports(code: string): string {
    // 移除 vue-i18n 导入
    const vueI18nImportRegex =
      /import\s*\{[^}]*\}\s*from\s*['"]vue-i18n['"];?\n?/g;
    return code.replace(vueI18nImportRegex, '');
  }

  /**
   * 清理 useI18n 相关声明
   * @param code - 源代码
   * @returns 清理后的代码
   */
  private static cleanupUseI18nDeclarations(code: string): string {
    // 移除 const { t } = useI18n();
    const useI18nDeclarationRegex =
      /const\s*\{\s*t\s*\}\s*=\s*useI18n\(\);?\n?/g;
    return code.replace(useI18nDeclarationRegex, '');
  }
}
