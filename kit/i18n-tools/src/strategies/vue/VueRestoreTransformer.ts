import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import { CommonASTUtils } from '../../utils/common-ast-utils';
import type { LocaleMap } from '../../utils/types';
import type { IRestoreTransformer } from '../../adapters/FrameworkAdapter';
import type { VueI18nLibrary } from './libraries';

/**
 * Vue 还原代码转换器
 * 负责将 i18n 调用还原为原始文本
 */
export class VueRestoreTransformer implements IRestoreTransformer {
  private library: VueI18nLibrary;
  private tImport: string;

  constructor(library: VueI18nLibrary, tImport: string) {
    this.library = library;
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

    return VueRestoreTransformer.restoreVueFile(sourceText, localeMap, this.library);
  }

  /**
   * 还原 Vue 文件
   */
  static restoreVueFile(
    sourceText: string,
    localeMap: Record<string, string>,
    library: VueI18nLibrary,
  ): string {
    const lib = library;
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
      const restoredTemplate = this.restoreTemplate(descriptor.template.content, localeMap, lib);
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
      restoredCode = restoredCode.slice(0, start) + content + restoredCode.slice(end);
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
    library: VueI18nLibrary,
    tImport?: string,
  ): string {
    const lib = library;

    let restoredCode = this.restoreScript(sourceText, localeMap, lib);

    if (restoredCode === sourceText) {
      return sourceText;
    }

    // 清理库导入（vue-i18n 等）
    restoredCode = this.cleanupImports(restoredCode, lib);
    restoredCode = this.cleanupHookDeclarations(restoredCode, lib);

    // 清理自定义路径的 t 导入（如 import { t } from '@/plugins/locale'）
    if (tImport) {
      const escapedPath = CommonASTUtils.escapeRegExp(tImport);
      restoredCode = restoredCode.replace(
        new RegExp(`import\\s*\\{\\s*t\\s*\\}\\s*from\\s*['"]${escapedPath}['"];?\\n?`, 'g'),
        '',
      );
    }

    return restoredCode;
  }

  /**
   * 还原 template 中的 i18n 调用
   *
   * 三个 pass 的关键不变量：pass 1/2 的还原结果（即 locale 文本）可能包含
   * 形似 `t('xxx')` 的字面字符串（例如原文 `调用 t('foo') 函数`），若直接放进
   * `restored` 字符串里再跑 pass 3，会被 innerI18nCallRegex 误命中而二次替换。
   * 因此 pass 1/2 输出占位符（NUL 边界确保无法在 Vue 源里出现），pass 3 跑完后
   * 再统一回填，保证 pass 3 永远只扫描真正残留的 i18n 调用。
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

    // pass 1/2 占位机制：用 PUA 字符（U+E000）作为不可见边界包裹 `I18N_R_<idx>`，
    // 隔离已还原片段，防止 pass 3 的 innerI18nCallRegex 把 locale 文本里碰巧出现的
    // `t('xxx')` 字面字符串当成残留的 i18n 调用再次替换。
    // Why PUA：Vue 模板源不会合法含 PUA 字符；相比纯 ASCII token（如 `I18N_R_0`），
    // 后者若出现在 locale 原文（技术文档场景）会被回填正则误吞，是结构性漏洞。
    const placeholders: string[] = [];
    const stash = (text: string): string => {
      const token = `I18N_R_${placeholders.length}`;
      placeholders.push(text);
      return token;
    };

    // 1. 匹配 {{ $t('key') }} 或 {{ t('key') }} 或 {{ $t('key', { vars }) }}
    //    仅匹配整个插值内容为单个 $t 调用的情况
    //    vars 段支持单层嵌套花括号（如 { obj: { a: 1 } }）
    const i18nCallRegex =
      /\{\{\s*\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{(?:[^{}]|\{[^{}]*\})*\}))?\s*\)\s*\}\}/g;

    restored = restored.replace(i18nCallRegex, (match, key, vars) => {
      const text = lookupText(key as string);
      if (!text) {
        return match;
      }

      if (vars) {
        try {
          return stash(this.restoreTemplateWithVariables(text, vars as string, 'mustache'));
        } catch {
          return stash(text);
        }
      }

      return stash(text);
    });

    // 2. 匹配属性绑定 :attr="$t('key')" 或 :attr='$t("key")'（外/内引号任意组合）。
    //    还原为静态属性 attr="文本"。vars 段支持单层嵌套花括号。
    //    Why 用反向引用 \2：Vue 官方允许 `:attr='...'` 单引号写法，原先只匹配
    //    双引号外层时，单引号场景会绕过本 pass，被 pass 3 兜底替换为 'text'，
    //    输出 `:attr=''text''` 无效语法。
    const attrBindingRegex =
      /:([\w-]+)=(["'])\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{(?:[^{}]|\{[^{}]*\})*\}))?\s*\)\2/g;

    restored = restored.replace(attrBindingRegex, (match, attrName, _outer, key, vars) => {
      const text = lookupText(key as string);
      if (!text) {
        return match;
      }

      if (vars) {
        try {
          const restoredText = this.restoreTemplateWithVariables(text, vars as string, 'template');
          // 带变量的还原保持动态绑定，使用 ${expr} 语法
          return stash(`:${attrName}="\`${restoredText}\`"`);
        } catch {
          return stash(`${attrName}="${text}"`);
        }
      }

      return stash(`${attrName}="${text}"`);
    });

    // 3. 匹配插值表达式内部残留的 $t() 调用（如三元表达式中的 $t 调用）
    //    将 $t('key') 替换为 'text'，$t('key', { vars }) 替换为 `text with ${vars}`
    //    vars 段支持单层嵌套花括号。
    const innerI18nCallRegex =
      /\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{(?:[^{}]|\{[^{}]*\})*\}))?\s*\)/g;

    restored = restored.replace(innerI18nCallRegex, (match, key, vars) => {
      const text = lookupText(key as string);
      if (!text) {
        return match;
      }

      if (vars) {
        try {
          const restoredText = this.restoreTemplateWithVariables(text, vars as string, 'template');
          return `\`${restoredText}\``;
        } catch {
          return `'${text}'`;
        }
      }

      return `'${text}'`;
    });

    // 回填占位符
    restored = restored.replace(/I18N_R_(\d+)/g, (_match, idx) => placeholders[Number(idx)]!);

    return restored;
  }

  /**
   * 解析变量映射
   */
  private static parseVarMap(vars: string): Map<string, string> {
    const varMap = new Map<string, string>();

    // 剥掉最外层 `{}`、去掉首尾空白
    let body = vars.trim();
    if (body.startsWith('{') && body.endsWith('}')) {
      body = body.slice(1, -1);
    }

    // 用括号/引号深度计数分割键值对，避免 `[^,}]+` 在嵌套对象或字符串
    // 中的逗号、右花括号处误截断（如 `{ fmt: date.toFormat('YYYY, MM') }`、
    // `{ obj: { a: 1 } }`）。
    const segments: string[] = [];
    let depthCurly = 0;
    let depthParen = 0;
    let depthBracket = 0;
    let inString: '"' | "'" | '`' | null = null;
    let start = 0;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      const prev = i > 0 ? body[i - 1] : '';
      if (inString) {
        if (ch === inString && prev !== '\\') inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }
      if (ch === '{') depthCurly++;
      else if (ch === '}') depthCurly--;
      else if (ch === '(') depthParen++;
      else if (ch === ')') depthParen--;
      else if (ch === '[') depthBracket++;
      else if (ch === ']') depthBracket--;
      else if (ch === ',' && depthCurly === 0 && depthParen === 0 && depthBracket === 0) {
        segments.push(body.slice(start, i));
        start = i + 1;
      }
    }
    if (start < body.length) {
      segments.push(body.slice(start));
    }

    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      if (key) varMap.set(key, value);
    }

    return varMap;
  }

  /**
   * 还原带变量的模板字符串（用于文本节点，使用 Vue 模板插值语法 {{ }} ）
   */
  /**
   * 还原带变量的模板字符串。
   * - syntax='mustache'：用于 template 文本节点，输出 Vue 插值 `{{ expr }}`
   * - syntax='template'：用于属性绑定 / JS 模板字面量，输出 `${expr}`
   */
  private static restoreTemplateWithVariables(
    text: string,
    vars: string,
    syntax: 'mustache' | 'template',
  ): string {
    const varMap = this.parseVarMap(vars);
    let result = text;
    varMap.forEach((expression, placeholder) => {
      const placeholderPattern = new RegExp(`\\{${placeholder}\\}`, 'g');
      const replacement = syntax === 'mustache' ? `{{ ${expression} }}` : `\${${expression}}`;
      result = result.replace(placeholderPattern, replacement);
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
    const sourceFile = CommonASTUtils.parseSourceFile(scriptContent, 'temp.ts');

    // 遍历 AST 收集 t() 调用的替换位置
    const replacements: Array<{ start: number; end: number; text: string }> = [];

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const replacement = this.getI18nCallReplacementText(node, localeMap, sourceFile, library);
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
            const exprText = CommonASTUtils.nodeToText(prop.initializer, sourceFile);
            varMap.set(prop.name.text, exprText);
          }
        }

        if (varMap.size > 0) {
          // 模板字面量需先转义 `\\`（必须最先），再转义反引号与 `${`。
          // 真实换行允许出现在模板字面量内，无需转换。
          let result = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
          // 替换占位符为变量表达式
          varMap.forEach((exprText, placeholder) => {
            result = result.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), `\${${exprText}}`);
          });
          return `\`${result}\``;
        }
      }
    }

    // 简单替换: t('key') → '文本'
    // 单引号字符串不能跨行，且 \u2028 / \u2029 即便在 ES2019+ 字符串里合法
    // 也会被许多老版本 JS 解析器视为非法。一并转义，确保生成代码恒合法。
    return `'${VueRestoreTransformer.escapeForSingleQuoted(text)}'`;
  }

  private static escapeForSingleQuoted(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
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
  private static cleanupHookDeclarations(code: string, library: VueI18nLibrary): string {
    return code.replace(library.getHookDeclarationCleanupRegex(), '');
  }
}
