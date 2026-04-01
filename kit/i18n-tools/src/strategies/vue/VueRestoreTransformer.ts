import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import { CommonASTUtils } from '../../utils/ast/CommonASTUtils';
import type { LocaleMap } from '../../utils/types';
import type { IRestoreTransformer } from '../../adapters/FrameworkAdapter';
import type { VueI18nLibrary } from './libraries';
import { VueI18nLibraryImpl } from './libraries';

/**
 * Vue 还原代码转换器
 * 负责将 i18n 调用还原为原始文本
 */
export class VueRestoreTransformer implements IRestoreTransformer {
  private library: VueI18nLibrary;
  private tImport: string;

  constructor(library?: VueI18nLibrary, tImport: string = '@/plugins/locale') {
    this.library = library ?? new VueI18nLibraryImpl();
    this.tImport = tImport;
  }

  /**
   * 转换文件（实现接口方法）
   */
  transform(filePath: string, localeMap: LocaleMap): string {
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath);

    // .ts/.js 文件不是 Vue SFC，直接用 script 还原逻辑
    if (ext === '.ts' || ext === '.js') {
      return VueRestoreTransformer.restoreStandaloneScript(
        sourceText,
        localeMap,
        this.library,
        this.tImport,
      );
    }

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

    // 收集需要替换的区域，使用 SFC 解析器的 loc 偏移量精确定位，
    // 避免 String.replace() 在内容重复时替换到错误位置
    const replacements: Array<{
      start: number;
      end: number;
      content: string;
    }> = [];

    // 还原 template 部分
    if (descriptor.template) {
      const restoredTemplate = this.restoreTemplate(
        descriptor.template.content,
        localeMap,
        lib,
      );
      if (restoredTemplate !== descriptor.template.content) {
        replacements.push({
          start: descriptor.template.loc.start.offset,
          end: descriptor.template.loc.end.offset,
          content: restoredTemplate,
        });
      }
    }

    // 还原 script 部分
    const script = descriptor.scriptSetup || descriptor.script;
    if (script) {
      const restoredScript = this.restoreScript(script.content, localeMap, lib);
      if (restoredScript !== script.content) {
        replacements.push({
          start: script.loc.start.offset,
          end: script.loc.end.offset,
          content: restoredScript,
        });
      }
    }

    // 按偏移量从后往前替换，确保前面的替换不影响后面的偏移
    replacements.sort((a, b) => b.start - a.start);
    for (const { start, end, content } of replacements) {
      restoredCode =
        restoredCode.slice(0, start) + content + restoredCode.slice(end);
    }

    // 清理导入和 Hook 声明
    restoredCode = this.cleanupImports(restoredCode, lib);
    restoredCode = this.cleanupHookDeclarations(restoredCode, lib);

    return restoredCode;
  }

  /**
   * 还原独立的 .ts/.js 文件
   */
  static restoreStandaloneScript(
    sourceText: string,
    localeMap: Record<string, string>,
    library?: VueI18nLibrary,
    tImport?: string,
  ): string {
    const lib = library ?? new VueI18nLibraryImpl();

    let restoredCode = this.restoreScript(sourceText, localeMap, lib);

    if (restoredCode === sourceText) {
      return sourceText;
    }

    // 清理库导入（vue-i18n 等）
    restoredCode = this.cleanupImports(restoredCode, lib);
    restoredCode = this.cleanupHookDeclarations(restoredCode, lib);

    // 清理自定义路径的 t 导入（如 import { t } from '@/plugins/locale'）
    if (tImport) {
      const escapedPath = tImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      restoredCode = restoredCode.replace(
        new RegExp(
          `import\\s*\\{\\s*t\\s*\\}\\s*from\\s*['"]${escapedPath}['"];?\\n?`,
          'g',
        ),
        '',
      );
    }

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

    // 辅助函数：去掉命名空间前缀并查找 locale 文本
    const lookupText = (rawKey: string): string | undefined => {
      let lookupKey = rawKey;
      if (library.supportsNamespace) {
        const colonIndex = lookupKey.indexOf(':');
        if (colonIndex !== -1) {
          lookupKey = lookupKey.substring(colonIndex + 1);
        }
      }
      return localeMap[lookupKey] || localeMap[rawKey];
    };

    // 1. 匹配 {{ $t('key') }} 或 {{ t('key') }} 或 {{ $t('key', { vars }) }}
    //    仅匹配整个插值内容为单个 $t 调用的情况
    const i18nCallRegex =
      /\{\{\s*\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]+\}))?\s*\)\s*\}\}/g;

    restored = restored.replace(i18nCallRegex, (match, key, vars) => {
      const text = lookupText(key as string);
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

    // 2. 匹配属性绑定 :attr="$t('key')" 或 :attr="$t('key', { vars })"
    //    还原为静态属性 attr="文本"
    const attrBindingRegex =
      /:([\w-]+)="\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]+\}))?\s*\)"/g;

    restored = restored.replace(
      attrBindingRegex,
      (match, attrName, key, vars) => {
        const text = lookupText(key as string);
        if (!text) {
          return match;
        }

        if (vars) {
          try {
            const restoredText = this.restoreTemplateWithVariablesForBinding(
              text,
              vars as string,
            );
            // 带变量的还原保持动态绑定，使用 ${expr} 语法
            return `:${attrName}="\`${restoredText}\`"`;
          } catch {
            return `${attrName}="${text}"`;
          }
        }

        return `${attrName}="${text}"`;
      },
    );

    // 3. 匹配插值表达式内部残留的 $t() 调用（如三元表达式中的 $t 调用）
    //    将 $t('key') 替换为 'text'，$t('key', { vars }) 替换为 `text with ${vars}`
    const innerI18nCallRegex =
      /\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]+\}))?\s*\)/g;

    restored = restored.replace(innerI18nCallRegex, (match, key, vars) => {
      const text = lookupText(key as string);
      if (!text) {
        return match;
      }

      if (vars) {
        try {
          const restoredText = this.restoreTemplateWithVariablesForBinding(
            text,
            vars as string,
          );
          return `\`${restoredText}\``;
        } catch {
          return `'${text}'`;
        }
      }

      return `'${text}'`;
    });

    return restored;
  }

  /**
   * 解析变量映射
   */
  private static parseVarMap(vars: string): Map<string, string> {
    const varMap = new Map<string, string>();
    const varMatches = vars.matchAll(/(\w+):\s*([^,}]+)/g);
    for (const [, key, value] of varMatches) {
      varMap.set(key!.trim(), value!.trim());
    }
    return varMap;
  }

  /**
   * 还原带变量的模板字符串（用于文本节点，使用 Vue 模板插值语法 {{ }} ）
   */
  private static restoreTemplateWithVariables(
    text: string,
    vars: string,
  ): string {
    const varMap = this.parseVarMap(vars);
    let result = text;
    varMap.forEach((expression, placeholder) => {
      const placeholderPattern = new RegExp(`\\{${placeholder}\\}`, 'g');
      result = result.replace(placeholderPattern, `{{ ${expression} }}`);
    });
    return result;
  }

  /**
   * 还原带变量的模板字符串（用于属性绑定，使用 JS 模板字面量语法 ${} ）
   */
  private static restoreTemplateWithVariablesForBinding(
    text: string,
    vars: string,
  ): string {
    const varMap = this.parseVarMap(vars);
    let result = text;
    varMap.forEach((expression, placeholder) => {
      const placeholderPattern = new RegExp(`\\{${placeholder}\\}`, 'g');
      result = result.replace(placeholderPattern, `\${${expression}}`);
    });
    return result;
  }

  /**
   * 还原 script 中的 i18n 调用
   * 使用基于位置的文本替换而非 AST 变换 + printer，以保留原始代码格式（空行、缩进等）
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

    // 遍历 AST 收集 t() 调用的替换位置
    const replacements: Array<{ start: number; end: number; text: string }> =
      [];

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const replacement = this.getI18nCallReplacementText(
          node,
          localeMap,
          sourceFile,
          library,
        );
        if (replacement !== null) {
          replacements.push({
            start: node.getStart(sourceFile),
            end: node.getEnd(),
            text: replacement,
          });
          return; // 不再遍历已匹配调用的子节点
        }
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    if (replacements.length === 0) {
      return scriptContent;
    }

    // 从后往前替换，保持前面的偏移量不变
    replacements.sort((a, b) => b.start - a.start);
    let result = scriptContent;
    for (const { start, end, text } of replacements) {
      result = result.slice(0, start) + text + result.slice(end);
    }

    return result;
  }

  /**
   * 获取 t()/$t() 调用的还原替换文本
   * 返回 null 表示不是 i18n 调用或没有找到对应翻译
   */
  private static getI18nCallReplacementText(
    node: ts.CallExpression,
    localeMap: Record<string, string>,
    sourceFile: ts.SourceFile,
    library: VueI18nLibrary,
  ): string | null {
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

    // 带变量: t('key', { name: expr }) → `text ${expr}`
    if (node.arguments.length > 1) {
      const varsArg = node.arguments[1]!;
      if (ts.isObjectLiteralExpression(varsArg)) {
        const varMap = new Map<string, string>();
        for (const prop of varsArg.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const exprText = CommonASTUtils.nodeToText(
              prop.initializer,
              sourceFile,
            );
            varMap.set(prop.name.text, exprText);
          }
        }

        if (varMap.size > 0) {
          // 先转义模板字面量中的特殊字符
          let result = text.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
          // 替换占位符为变量表达式
          varMap.forEach((exprText, placeholder) => {
            result = result.replace(
              new RegExp(`\\{${placeholder}\\}`, 'g'),
              `\${${exprText}}`,
            );
          });
          return `\`${result}\``;
        }
      }
    }

    // 简单替换: t('key') → '文本'
    const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${escaped}'`;
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
