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

    // locale 值归一：i18next 系库双花括号占位符 → 单花括号；并把写盘时转义的
    // 字面量花括号（vue-i18n 的 `{'{'}` 等）还原回普通 `{` `}`。
    // 与 React restore 共用 CommonASTUtils.normalizeRestoreLocaleMap（消除两端重复实现）。
    const map = CommonASTUtils.normalizeRestoreLocaleMap(localeMap, this.library);

    // .ts/.js 文件不是 Vue SFC，直接用 script 还原逻辑
    if (ext === '.ts' || ext === '.js') {
      return VueRestoreTransformer.restoreStandaloneScript(
        sourceText,
        map,
        this.library,
        this.tImport,
      );
    }

    return VueRestoreTransformer.restoreVueFile(sourceText, map, this.library, this.tImport);
  }

  /**
   * 还原 Vue 文件
   */
  static restoreVueFile(
    sourceText: string,
    localeMap: Record<string, string>,
    library: VueI18nLibrary,
    tImport?: string,
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

    // 还原 script 部分：SFC 允许 `<script>` 与 `<script setup>` 同时存在，
    // VueTransformer 生成阶段对两个块都做提取，还原阶段必须对称处理，否则
    // 仅有 `<script>` 块的 `this.$t(...)` 调用不会被还原，导致 generate/restore 往返丢数据。
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (!block) continue;
      const restoredScript = this.restoreScript(block.content, localeMap, lib);
      if (restoredScript !== block.content) {
        replacements.push({
          start: block.loc.start.offset,
          end: block.loc.end.offset,
          content: restoredScript,
        });
      }
    }

    // 按偏移量从后往前替换，确保前面的替换不影响后面的偏移
    replacements.sort((a, b) => b.start - a.start);
    for (const { start, end, content } of replacements) {
      restoredCode = restoredCode.slice(0, start) + content + restoredCode.slice(end);
    }

    // 清理 hook 来源：`useI18n` 库导入 + `const { t } = useI18n()` 声明是 t 的同一来源，
    // 必须同进退。守卫：仅当 t 在还原后的 script 中已无值引用时才删除——t 由 hook 提供时，
    // 若存在「locale 缺 key / 动态 key」未被还原的存活 t() 调用，删任一半都会产出未定义标识符
    // （删声明 → 未定义 t；删 import → 未定义 useI18n）。下方模块 import 清理只守卫 import
    // 绑定、保护不到 hook 绑定，故此处独立守卫。正常 restore（全部 key 命中、t() 清空）下
    // t 已无引用，行为与原先一致。
    if (this.isTNameUnusedInScript(restoredCode)) {
      // 先清理 hook 声明（单键 `const { t } = useI18n()` 会被整条删除），再守卫删 import：
      // 仅当清理后 script 里已无 hookName( 调用时才删导入。否则多键解构
      // `const { t, locale } = useI18n()` 因声明清理正则只匹配单键 `{ t }` 而保留，其
      // useI18n() 调用仍在，无条件删 import 会产出未定义 useI18n（ReferenceError / TS2304）。
      // 与 generate 侧 VueImportManager.removeHookImportAndDeclaration 的 hookCallStillUsed 守卫对称。
      restoredCode = this.cleanupHookDeclarations(restoredCode, lib);
      if (!this.hookCallStillUsed(restoredCode, lib)) {
        restoredCode = this.cleanupImports(restoredCode, lib);
      }
    }

    // 清理模块顶层 `import { t } from <tImport>`：
    // generate 阶段对 `<script setup>` 走「模块 import」路径而非 useI18n hook，
    // restore 必须对称清理，否则 restore 后 t 不再被使用，遗留的 import
    // 会触发 ESLint `no-unused-vars` / TS unused warning。
    // 仅在 SFC 的 script/scriptSetup 范围内清理（template/style 不会含 import 语句）。
    //
    // 守卫：仅当 t 在还原后的 script 中已无任何引用时才删除——若存在「locale 查不到、未被
    // 还原」的存活 t() 调用，t 仍被使用，删 import 会产出未定义 t（TS2304）。与 React 端
    // ReactRestoreTransformer.finalizeTImport 对称。
    if (tImport && this.isTImportUnusedInScript(restoredCode, tImport)) {
      restoredCode = this.cleanupPluginLocaleImport(restoredCode, tImport);
    }

    return restoredCode;
  }

  /**
   * 判断还原后的 SFC 中，tImport 的 `t` 是否在 script 块里已无引用。
   *
   * .vue 整体不是合法 TS，无法直接解析；取 script/scriptSetup 块内容合并后（Vue3 SFC 多
   * script 共享模块作用域）交给 CommonASTUtils.isImportedNameUnused 判定。无 script 块或无
   * 该 import 时返回 false（无可清理）。
   */
  private static isTImportUnusedInScript(restoredCode: string, tImport: string): boolean {
    const { descriptor } = parseSFC(restoredCode);
    const scriptContent = [descriptor.script, descriptor.scriptSetup]
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => b.content)
      .join('\n');
    if (!scriptContent.trim()) return false;
    return CommonASTUtils.isImportedNameUnused(scriptContent, 'sfc.ts', tImport, 't');
  }

  /**
   * 判断还原后的 SFC script 中，名为 `t` 的绑定是否已无值引用（残留 t() 调用）。
   *
   * 用于守卫 hook 声明 `const { t } = useI18n()` 的删除：t 由 hook 提供时，若仍有未被还原的
   * t() 调用（locale 缺 key / 动态 key），删声明会产出未定义 t（TS2304）。与模块 import 的
   * isTImportUnusedInScript 守卫互补——后者只认 import 绑定，认不出 hook 绑定。
   * 无 script 块时返回 true（无引用，亦无可清理）。
   */
  private static isTNameUnusedInScript(restoredCode: string): boolean {
    const { descriptor } = parseSFC(restoredCode);
    const scriptContent = [descriptor.script, descriptor.scriptSetup]
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => b.content)
      .join('\n');
    if (!scriptContent.trim()) return true;
    return CommonASTUtils.isLocalNameUnused(scriptContent, 'sfc.ts', 't');
  }

  /**
   * 判断还原后的 SFC script 中，hook（library.hookName，如 useI18n / useTranslation）调用
   * 是否仍存在。用于守卫 cleanupImports 删除 hook 导入：清理 hook 声明后若仍有 hookName(
   * 调用（如多键解构 `const { t, locale } = useI18n()` 未被单键正则命中而保留），删其 import
   * 会产出未定义标识符。与 generate 侧 VueImportManager.removeHookImportAndDeclaration 对称。
   * 无 script 块时返回 false（无调用，亦无可保护）。
   */
  private static hookCallStillUsed(restoredCode: string, library: VueI18nLibrary): boolean {
    const { descriptor } = parseSFC(restoredCode);
    const scriptContent = [descriptor.script, descriptor.scriptSetup]
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => b.content)
      .join('\n');
    if (!scriptContent.trim()) return false;
    const escapedHook = CommonASTUtils.escapeRegExp(library.hookName);
    return new RegExp(`\\b${escapedHook}\\s*\\(`).test(scriptContent);
  }

  /**
   * 清理 `import { t } from '<tImport>'`（含同时导入其它命名的混合形式）。
   *
   * 实现说明：
   *  - 只 t 一个命名：整条 import 直接删除（与 restoreStandaloneScript 行为对称）
   *  - 还有其它命名（如 `import { t, i18n } from '...'`）：仅从命名集合中摘掉 t，保留其它
   *
   * 仅做"工具确定不会再用 t"场景下的清理；用户手写代码若还有 t() 调用，相应的 t import
   * 应在 restoreScript 阶段就保留（restoreScript 命中翻译才会做替换）。
   */
  private static cleanupPluginLocaleImport(code: string, tImport: string): string {
    const escapedPath = CommonASTUtils.escapeRegExp(tImport);
    // 形式 1：仅 t 一个命名 → 整条 import 删除
    const onlyT = new RegExp(
      `import\\s*\\{\\s*t\\s*\\}\\s*from\\s*['"]${escapedPath}['"];?\\n?`,
      'g',
    );
    let updated = code.replace(onlyT, '');
    // 形式 2：t 与其它命名混合 → 仅摘掉 t，保留其它命名
    const mixed = new RegExp(`(import\\s*\\{)([^}]*)(\\}\\s*from\\s*['"]${escapedPath}['"])`, 'g');
    updated = updated.replace(mixed, (_match, head: string, body: string, tail: string) => {
      const names = body
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== 't' && !/^t\s+as\s+/.test(s));
      if (names.length === 0) {
        // 全部命名都被剔除（理论上 onlyT 已先消掉，这里是兜底）
        return '';
      }
      return `${head} ${names.join(', ')} ${tail}`;
    });
    return updated;
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

    // 清理 hook 来源：`useI18n` 库导入 + `const { t } = useI18n()` 声明必须同进退。
    // 守卫：仅当 t 已无值引用时才删除（与 SFC 路径对称；locale 缺 key / 动态 key 时残留 t()
    // 仍引用 t，删任一半都会产出未定义标识符）。
    if (CommonASTUtils.isLocalNameUnused(restoredCode, 'standalone.ts', 't')) {
      // 先删 hook 声明，再守卫删 import：多键解构 `const { t, locale } = useI18n()` 因声明
      // 清理正则只匹配单键 `{ t }` 而保留，其 useI18n() 调用仍在时不得删 import（否则未定义
      // useI18n）。与 SFC 路径 / generate 侧 hookCallStillUsed 守卫对称。
      restoredCode = this.cleanupHookDeclarations(restoredCode, lib);
      const escapedHook = CommonASTUtils.escapeRegExp(lib.hookName);
      if (!new RegExp(`\\b${escapedHook}\\s*\\(`).test(restoredCode)) {
        restoredCode = this.cleanupImports(restoredCode, lib);
      }
    }

    // 清理自定义路径的 t 导入（如 import { t } from '@/plugins/locale'）。
    // 复用 SFC 路径的 helper：可处理 `import { t }` 与 `import { t, i18n }` 混合形式。
    // 守卫：仅当 t 在还原后已无引用时才删除——存活的 t() 调用（locale 缺 key / 动态 key）
    // 仍引用 t，删 import 会产出未定义 t（TS2304）。与 SFC 路径 / React 端对称。
    if (
      tImport &&
      CommonASTUtils.isImportedNameUnused(restoredCode, 'standalone.ts', tImport, 't')
    ) {
      restoredCode = this.cleanupPluginLocaleImport(restoredCode, tImport);
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
    // PUA U+E000 作为不可见边界字符；Vue 模板源不会合法含此字符。
    const PUA = '\uE000';
    const placeholders: string[] = [];
    const stash = (text: string): string => {
      const token = `${PUA}I18N_R_${placeholders.length}${PUA}`;
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
          return stash(this.escapeTemplateText(text));
        }
      }

      return stash(this.escapeTemplateText(text));
    });

    // 2. 匹配属性绑定 :attr="$t('key')" 或 :attr='$t("key")'（外/内引号任意组合）。
    //    还原为静态属性 attr="文本"。vars 段支持单层嵌套花括号。
    //    Why 用反向引用 \2：Vue 官方允许 `:attr='...'` 单引号写法，原先只匹配
    //    双引号外层时，单引号场景会绕过本 pass，被 pass 3 兜底替换为 'text'，
    //    输出 `:attr=''text''` 无效语法。
    //    锚点用 `(?:v-bind)?:` 同时覆盖简写 `:attr=` 与完整 `v-bind:attr=`：完整写法下整体
    //    匹配 `v-bind:attr=...` 并连同 `v-bind` 前缀一起替换为静态属性，避免只吃掉 `:attr`
    //    残留 `v-bind` 拼出非法属性名 `v-bindattr`。
    const attrBindingRegex =
      /(?:v-bind)?:([\w-]+)=(["'])\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{(?:[^{}]|\{[^{}]*\})*\}))?\s*\)\2/g;

    restored = restored.replace(attrBindingRegex, (match, attrName, _outer, key, vars) => {
      const text = lookupText(key as string);
      if (!text) {
        return match;
      }

      if (vars) {
        try {
          const restoredText = this.restoreTemplateWithVariables(text, vars as string, 'template');
          // 带变量的还原保持动态绑定（:attr="`...`"），值是 JS 模板字面量。restoredText 的
          // 字面段已在 restoreTemplateWithVariables 里转义过反引号/${；这里再把会终结外层双引号
          // 属性的 " 转义为 &quot;（Vue 解析绑定属性前会先解 HTML 实体，&quot; 会还原成 "，
          // 故表达式语义不变），避免引号失衡破坏标签。
          return stash(`:${attrName}="\`${restoredText.replace(/"/g, '&quot;')}\`"`);
        } catch {
          return stash(`${attrName}="${this.escapeAttrValue(text)}"`);
        }
      }

      return stash(`${attrName}="${this.escapeAttrValue(text)}"`);
    });

    // 3. 匹配插值表达式内部残留的 $t() 调用（如三元表达式中的 $t 调用）
    //    将 $t('key') 替换为 'text'，$t('key', { vars }) 替换为 `text with ${vars}`
    //    vars 段支持单层嵌套花括号。
    // 前置 (?<![\w$]) 防止误匹配以字母 t 结尾的非 i18n 函数（如 someFnt('key')），
    // 与 VueComponentInjector.needsHook 的 t 调用探测保持一致。
    const innerI18nCallRegex =
      /(?<![\w$])\$?t\(['"]([^'"]+)['"]\s*(?:,\s*(\{(?:[^{}]|\{[^{}]*\})*\}))?\s*\)/g;

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
          return `'${VueRestoreTransformer.escapeForSingleQuoted(text)}'`;
        }
      }

      // 与脚本侧 getI18nCallReplacementText、pass 1/2 同口径转义：text 是 locale 原值，
      // 含 `'` 或 `\`（如英文 don't、含反斜杠路径）时未转义会生成语法错误表达式。
      return `'${VueRestoreTransformer.escapeForSingleQuoted(text)}'`;
    });

    // 回填占位符
    restored = restored.replace(
      /\uE000I18N_R_(\d+)\uE000/g,
      (_match, idx) => placeholders[Number(idx)]!,
    );

    return restored;
  }

  /**
   * 还原到「模板文本节点」时对 locale 值做 HTML 文本转义。
   *
   * Why：正向是 `{{ $t('k') }}` —— Vue 插值在运行时自动转义输出；restore 把它换成
   * 静态文本节点后，locale 值里的 `<`/`>`/`&`（提取时由 @vue/compiler-dom 解码自
   * `&lt;`/`&amp;` 等实体）会被模板编译器当作真实标签 / 实体解析，导致结构变样
   * （如 `<code>` 变成真元素）。这里把它们重新转义，使 restore 与正向渲染对称。
   *
   * ⚠️ 仅用于「文本节点」上下文（pass 1 与 mixed-content 的 mustache 分支）。
   * 属性绑定（pass 2）与脚本 / 三元里的 JS 字符串（pass 3）不得调用本函数——前者是
   * 属性值转义规则、后者是 JS 字符串字面量，套 HTML 转义会污染数据。
   * `&` 必须最先替换，否则会把后续生成的 `&lt;`/`&gt;` 里的 `&` 二次转义。
   *
   * 注：`©`/`&nbsp;`(U+00A0) 等不在 `<>&` 集合里 → 原样保留、渲染一致；真把 `©`
   * 还原成 `&copy;` 不可能（解码有损，无从得知原实体），也无必要。
   */
  private static escapeTemplateText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * 还原到「静态属性值」（双引号包裹）时对 locale 值做属性转义。
   *
   * Why：pass 2 把 :attr="$t('k')" 还原成 attr="文本"。若文本含 `"` 会终结属性引号导致标签
   * 解析错乱；含 `&`/`<`/`>` 则与提取阶段的实体解码不对称（提取把 `&amp;` 解成 `&`，还原须
   * 反向编码才能往返）。`&` 必须最先替换，否则会把后续生成的 `&quot;` 等里的 `&` 二次转义。
   */
  private static escapeAttrValue(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
    // mustache=文本节点上下文：先对字面文本做 HTML 转义，再注入 `{{ expr }}`
    // （占位符 `{name}` 不含 `<>&`，转义不影响其匹配；先转义可避免把注入的
    // `{{ }}` 表达式也转义掉）。template=属性/JS 模板字面量上下文：不转义。
    // mustache 文本节点：HTML 转义字面段。template（属性/JS 模板字面量）：转义会终结模板
    // 字面量的 `\\` / 反引号 / `${`（与脚本侧 getI18nCallReplacementText 同口径），使字面段里
    // 出现这些字符时不破坏生成的模板字面量；随后注入的 `${expr}` 在转义之后追加，不受影响。
    let result =
      syntax === 'mustache'
        ? this.escapeTemplateText(text)
        : text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
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
   * 清理工具注入的 hook 导入（仅摘除 library.hookName，不动同一行的其他命名导入）。
   *
   * Why 不再用 library.getImportCleanupRegex 直接 replace 成空串：那种粗粒度
   * 删除整条 import 的方式，会把用户手写的 `import { useI18n, createI18n }
   * from 'vue-i18n'` 中的 createI18n 一并删除，下游编译报错。
   */
  private static cleanupImports(code: string, library: VueI18nLibrary): string {
    return CommonASTUtils.removeNamedImports(
      code,
      (moduleName) => library.isLibraryImport(moduleName),
      [library.hookName],
    );
  }

  /**
   * 清理 Hook 相关声明
   */
  private static cleanupHookDeclarations(code: string, library: VueI18nLibrary): string {
    return code.replace(library.getHookDeclarationCleanupRegex(), '');
  }
}
