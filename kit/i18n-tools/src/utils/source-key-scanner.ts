import fs from 'fs';
import ts from 'typescript';
import { parse as parseSFC } from '@vue/compiler-sfc';
import type { ResolvedConfig } from '../config';
import type { FrameworkAdapter } from '../adapters/FrameworkAdapter';
import { parseSourceFile } from './ast-core';
import { stripComments } from './import-surgery';
import { decodeJsStringEscapes } from './string-escape';
import { FileUtils } from './file-utils';
import { stripStatefulFlags } from './path-matcher';

// =============================================================================
// 下面 CALL_FIRST_ARG / STRING_LITERAL / ATTR_PATTERNS / DEFINE_MESSAGES_BLOCK 合起来覆盖
// 各 i18n 库引用 key 的静态形式（一次匹配里首个非空捕获组 = key）。库无关：vue 项目不会有
// FormattedMessage、react 项目不会有 keypath，跨库同跑互不干扰；`id` 三条限定在
// FormattedMessage 标签 / formatMessage 调用 / defineMessages 定义块内，避免误吃普通
// HTML/对象 id。
//
// 仍按「尽力而为」不覆盖动态形式（t(prefix+x) / :keypath="expr" / v-t="{ path: expr }"），
// 这些由 keys.dynamicKeyAllowlist 兜底——静态扫描本就无法解析。
// =============================================================================

/**
 * 函数调用 `t(...)` / `$t(...)`：捕获第一个实参表达式（到顶层第一个 `,` 或 `)` 止）。
 * 随后从中提取所有字符串字面量，因此能覆盖：
 *   - `t('k')`             → 'k'
 *   - `t(cond ? 'a' : 'b')` → 'a' / 'b'（三元，两个 key 都算被引用）
 * 在第一个逗号处停止，避免误吃 `t('k', { name: 'John' })` 里的插值值 'John'。
 * 模板字符串 / 变量等动态形式自然不含字面量 → 不匹配（交给 dynamicKeyAllowlist）。
 *
 * 首参用 `(?:'[^']*'|"[^"]*"|[^,)])*` 匹配：先整体吃掉成对引号包裹的字符串字面量，
 * 再逐字符吃非 `,`/`)`。这样**字符串字面量内部**的逗号/右括号（如 `t('已完成, 待处理')`、
 * `t('点击(此处)')`）不会被误当作首参边界提前截断——否则首参被截成残缺片段、引号不闭合，
 * STRING_LITERAL 匹配失败，该 key 漏采 → 被 prune/doctor 当孤儿从所有 locale 永久删除。
 */
const CALL_FIRST_ARG_TAIL = String.raw`\s*\(\s*((?:'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|[^,)])*)`;
const CALL_FIRST_ARG = new RegExp(String.raw`(?:\$t|(?<!\w)t)` + CALL_FIRST_ARG_TAIL, 'g');
/**
 * 只认 `$t(...)` 的窄口径：文件顶层把 `t` 绑定到非 i18n 来源时，裸 `t()` 的首参不是 key，
 * 但同文件里的 `$t()` 仍是 i18n 调用（`$t` 与 `t` 是两个名字，不受该绑定影响）。
 */
const DOLLAR_CALL_FIRST_ARG = new RegExp(String.raw`\$t` + CALL_FIRST_ARG_TAIL, 'g');
/**
 * 从一段表达式文本里提取所有 'xxx' / "xxx" / `xxx`（无插值）字面量。
 *
 * 三个分支独立匹配（捕获组 1 = 单引号内文，组 2 = 双引号内文，组 3 = 反引号内文），
 * 强制开闭定界符同型：不要求配对的写法（`/['"]([^'"]+)['"]/`）会在内引号处截断，
 * 双引号串含撇号（英文极常见 `"Don't"` → 只取 `Don`）、单引号串含双引号（`'a"b'` → 只取 `a`），
 * 截断后的残缺 key 漏采 → 被 prune/doctor 当孤儿从所有 locale 永久删除（破坏性）。
 *
 * 反引号分支只接受**不含 `${`** 的模板串：`` t(`views.a.sub`) `` 与 `t('views.a.sub')`
 * 语义等价（ESLint `quotes: ['error','backtick']` 项目里是主流写法），不采同样会被当孤儿删除；
 * 含插值的模板串仍是动态形式，不匹配，交给 keys.dynamicKeyAllowlist。
 */
const STRING_LITERAL =
  /(?:'((?:\\[\s\S]|[^'\\])*)'|"((?:\\[\s\S]|[^"\\])*)"|`((?:\\[\s\S]|[^`\\$]|\$(?!\{))*)`)/g;

/**
 * 把字符串字面量内部文本按 JavaScript 常用转义语义还原为运行时 key。
 * scanner 只接收已经去掉外层引号的内容，因此不使用 eval。
 * 实现收口在 decodeJsStringEscapes（shouldReplaceNode 的源码侧归一同用），
 * 避免两套解码器覆盖面漂移。
 */
const decodeStringLiteralContent = (content: string): string => decodeJsStringEscapes(content);

/** TypeScript 解析器能吃下的扩展名（其余扩展名保持词法状态机口径，不做臆测解析）。 */
const TS_PARSEABLE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
/**
 * 源码里可能出现 JSX 文本的扩展名（与 ast-core.getScriptKind 走 TSX/JSX 的集合一致）。
 * 这些文件的正文不在引号内，词法状态机不可用；解析失败时也不能退回词法状态机。
 */
const JSX_CAPABLE_EXTENSIONS = ['.tsx', '.jsx', '.js', '.mjs', '.cjs'];

const hasExtension = (filePath: string, extensions: string[]): boolean => {
  const lower = filePath.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
};

/**
 * 收集整份源码里的注释区间：遍历到叶子 token，取其前导 trivia 中的注释。
 *
 * 只在叶子上取、且跳过 JsxText，是因为 JSX 文本节点内的 `//`、`/*` 只是正文字符
 * （TypeScript 自身也在 getTokenPosOfNode 里对 JsxText 特判「不可能含注释」）。若在
 * 非叶子节点上取前导 trivia，`<p>\n  // 这是正文\n  {t('k')}</p>` 的 SyntaxList 会从
 * JsxText 起点开始扫 trivia，把正文当行注释吞掉——正是本函数要避免的那类漏采。
 */
function collectCommentRanges(sourceFile: ts.SourceFile, text: string): ts.CommentRange[] {
  const ranges: ts.CommentRange[] = [];
  const seen = new Set<number>();
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.JsxText) return;
    // JSDoc 子树的 token 位置落在注释内部，其 trivia 计算无意义；JSDoc 本体会作为
    // 后继 token 的前导注释被正常收走。
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) {
      return;
    }
    const children = node.getChildren(sourceFile);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    const start = node.getStart(sourceFile);
    // leading 与 trailing 两路都要取：getLeadingCommentRanges 只从换行之后开始收集，
    // 与前一个 token 同行的注释（`t('k'); // 注释`、JSX 里的 `{/* 注释 */}`）只出现在
    // getTrailingCommentRanges 里，漏掉就等于没剥。
    for (const group of [
      ts.getLeadingCommentRanges(text, node.pos),
      ts.getTrailingCommentRanges(text, node.pos),
    ]) {
      for (const range of group ?? []) {
        if (range.end > start || seen.has(range.pos)) continue;
        seen.add(range.pos);
        ranges.push(range);
      }
    }
  };
  visit(sourceFile);
  return ranges.sort((a, b) => a.pos - b.pos);
}

/**
 * 把注释区间替换为等长空格（换行原样保留）。
 * 长度必须与原文逐字符对齐：调用方（VueComponentInjector、后续的偏移计算）依赖
 * 剥离前后偏移不漂移。
 */
function blankOutRanges(text: string, ranges: readonly ts.CommentRange[]): string {
  if (ranges.length === 0) return text;
  let out = '';
  let cursor = 0;
  for (const range of ranges) {
    if (range.pos < cursor) continue; // 理论上不重叠，越界时保守跳过而非错位拼接
    out += text.slice(cursor, range.pos);
    out += text.slice(range.pos, range.end).replace(/[^\r\n]/g, ' ');
    cursor = range.end;
  }
  return out + text.slice(cursor);
}

/** AST 精确剥注释；解析器判定源码有语法错误（或拿不到诊断）时返回 null 交由调用方兜底。 */
function stripCommentsByAst(filePath: string, raw: string): string | null {
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = parseSourceFile(raw, filePath);
  } catch {
    return null;
  }
  // parseDiagnostics 是解析器内部字段：语法错误时 TS 不抛异常而是就地"恢复"继续建树，
  // 恢复出的树可能把 JSX 正文错当代码。拿不到该字段（未来版本改名）时同样按失败处理，
  // 宁可退回兜底也不基于可能错误的树剥离。
  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.length > 0) return null;
  return blankOutRanges(raw, collectCommentRanges(sourceFile, raw));
}

/**
 * 按文件类型剥离注释，产出可供 scanKeyReferencesInContent 扫描的文本。
 *
 * Why 必须分流：stripComments 是 JS 词法状态机，只保护「引号内」的 `//`、`/*`。
 * 而 .vue 的 template 段是 HTML、.tsx/.jsx/.js 的 JSX 文本节点是正文——裸 URL
 * （`详情见 https://a.com {{ t('k') }}`）不在引号内，`//` 会被误当行注释把行尾 t()
 * 一并剥掉；不配对的 `/*`（如展示 `src/*` 写法）更会吞掉文件剩余全部内容 → key 漏采
 * → prune 把在用 key 当孤儿从所有 locale 永久删除。故两类都不能整文件交给词法状态机：
 *  - .vue：先经 SFC 拆段，template 只剥 HTML 注释，script/scriptSetup 才走 stripComments；
 *    其中 lang="tsx"/"jsx" 的块正文同样含 JSX 文本，按对应扩展名走 AST 剥离
 *  - JS/TS 系（含 JSX）：交 TypeScript 解析器，按 AST 的 token 前导 trivia 精确定位注释
 *
 * 解析失败的兜底方向统一是「多算不误删」：宁可让注释里的引用混入 used（多算 = 不删），
 * 也不能吞掉正文（少算 = 误删）。故 .vue 回退为「整文件只剥 HTML 注释」、JSX 系回退为
 * 「整文原样返回」；.ts/.mts/.cts 不含 JSX 正文，词法状态机对它仍然安全，回退到
 * stripComments 与既有行为一致。
 */
export function stripCommentsForScan(filePath: string, raw: string): string {
  if (filePath.endsWith('.vue')) return stripVueCommentsForScan(filePath, raw);
  if (!hasExtension(filePath, TS_PARSEABLE_EXTENSIONS)) return stripComments(raw);

  const stripped = stripCommentsByAst(filePath, raw);
  if (stripped !== null) return stripped;
  return hasExtension(filePath, JSX_CAPABLE_EXTENSIONS) ? raw : stripComments(raw);
}

/**
 * .vue 的单个 script 块剥注释：`lang="tsx"|"jsx"` 的块正文里有 JSX 文本节点，
 * 与 .tsx/.jsx 文件同源地交给 TypeScript 解析器按 token 前导 trivia 精确定位注释；
 * 词法状态机会把 JSX 正文里的 `//`（裸 URL）、不配对的 `/*` 当注释吞掉后续 t() 调用。
 * 解析失败时与 .tsx 分支同口径：原样返回（多算不误删），不退回词法状态机。
 */
function stripScriptBlockForScan(content: string, filePath: string, lang?: string): string {
  const normalized = lang?.toLowerCase();
  if (normalized !== 'tsx' && normalized !== 'jsx') return stripComments(content);
  return stripCommentsByAst(`${filePath}.${normalized}`, content) ?? content;
}

function stripVueCommentsForScan(filePath: string, raw: string): string {
  const stripHtmlComments = (text: string): string => text.replace(/<!--[\s\S]*?-->/g, ' ');
  try {
    const { descriptor, errors } = parseSFC(raw, { filename: filePath });
    // parse 对语法错误**不抛异常**、只收集进 errors，且此时 descriptor 可能缺段
    // （如未闭合的 </template 会让 script 块整个丢失）。缺段拼接 = key 漏采 = prune
    // 误删，必须在此显式回退整文件扫描，不能只依赖 catch（那条路径实际到不了）。
    if (errors.length > 0) {
      return stripHtmlComments(raw);
    }
    const parts: string[] = [];
    if (descriptor.template) {
      parts.push(stripHtmlComments(descriptor.template.content));
    }
    for (const script of [descriptor.script, descriptor.scriptSetup]) {
      if (!script) continue;
      parts.push(stripScriptBlockForScan(script.content, filePath, script.lang));
    }
    return parts.join('\n');
  } catch {
    // 兜底：万一未来版本的 parse 在极端输入下抛异常，仍走安全方向
    return stripHtmlComments(raw);
  }
}

/**
 * 属性 / 对象字段上的静态 key 值形态（捕获组全部是候选 key，命中时取首个非空组）：
 *  - `'k'` / `"k"`：普通引号值；
 *  - `"'k'"` / `'"k"'`：Vue 动态绑定（`:keypath="'k'"`）——外层是属性定界符、内层才是 JS 串；
 *  - `{'k'}` / `{"k"}` / `` {`k`} ``：JSX 表达式容器（`i18nKey={'k'}`），反引号不得含插值。
 * 嵌套形态必须排在普通引号分支之前：正则按序尝试，否则 `"'k'"` 会被外层双引号分支
 * 连引号一起吃进 key。普通引号分支排除花括号，避免把 `v-t="{ path: x }"` 这类对象值
 * 整段当成 key —— 多出来的假 key 会让 doctor 报 missing-key（error 级，CI 误红）。
 */
const ATTR_VALUE =
  '(?:' +
  "\"'([^'{}]+)'\"" + // "'k'"
  '|\'"([^"{}]+)"\'' + // '"k"'
  "|\\{\\s*'([^'{}]+)'\\s*\\}" + // {'k'}
  '|\\{\\s*"([^"{}]+)"\\s*\\}' + // {"k"}
  '|\\{\\s*`([^`${}]+)`\\s*\\}' + // {`k`}
  "|'([^'{}]+)'" + // 'k'
  '|"([^"{}]+)"' + // "k"
  ')';

/** 成对花括号（含一层嵌套）：JSX 表达式容器 `{{ n: a > 1 }}`、内联选项对象 `{ n: 1 }`。 */
const BRACE_GROUP = String.raw`\{(?:[^{}]|\{[^{}]*\})*\}`;

/** 组件 / 属性形式（库无关，跨库同跑互不干扰；id 两条限定上下文避免误吃普通 id）。 */
const ATTR_PATTERNS: RegExp[] = [
  // vue-i18n 组件：<i18n-t keypath="k"> / :keypath="'k'"
  new RegExp(String.raw`\bkeypath\s*=\s*` + ATTR_VALUE, 'g'),
  // vue-i18n 指令：v-t="'k'" / v-t='"k"'
  new RegExp(String.raw`\bv-t\s*=\s*` + ATTR_VALUE, 'g'),
  // vue-i18n 指令的对象形态：v-t="{ path: 'k' }"（path 为字面量时是静态引用，
  // 官方文档主推写法；path 为变量时不匹配，交给 dynamicKeyAllowlist）
  /\bv-t\s*=\s*["']?\{\s*path\s*:\s*(?:'([^']+)'|"([^"]+)")/g,
  // react-i18next 组件：<Trans i18nKey="k"> / i18nKey={'k'}
  new RegExp(String.raw`\bi18nKey\s*=\s*` + ATTR_VALUE, 'g'),
  // react-intl 组件：<FormattedMessage id="k">（限标签内的 id）。属性区按
  // 「非 `>` 字符 | 成对花括号」推进：`values={{ n: a > 1 }}` 里的 `>` 在花括号内，
  // 用 `[^>]*?` 会在此提前截断而漏采。
  new RegExp(
    String.raw`<FormattedMessage\b(?:[^>{]|${BRACE_GROUP})*?\bid\s*=\s*` + ATTR_VALUE,
    'g',
  ),
  // react-intl 调用：formatMessage({ id: 'k' })（限调用对象内的 id）。同理允许 id 之前
  // 出现一层嵌套对象（`formatMessage({ values: { n: 1 }, id: 'k' })`）。
  new RegExp(
    String.raw`\bformatMessage\s*\(\s*\{(?:[^{}]|${BRACE_GROUP})*?\bid\s*:\s*` + ATTR_VALUE,
    'g',
  ),
];

/**
 * react-intl 的 `defineMessages({ x: { id: 'k', defaultMessage: '…' } })`：
 * 消费侧写成 `formatMessage(messages.x)`，首参没有任何字面量，key 只出现在定义处。
 * 不采则整个 react-intl 项目的 key 会被 doctor 全量报孤儿、被 prune 从所有 locale 删除。
 * 先框出 defineMessages 调用体，再取其中所有 `id` 字段，避免误吃普通对象的 id。
 */
const DEFINE_MESSAGES_BLOCK = /\bdefineMessages\s*\(\s*\{[\s\S]*?\}\s*\)/g;
const MESSAGE_DESCRIPTOR_ID = new RegExp(String.raw`\bid\s*:\s*` + ATTR_VALUE, 'g');

/**
 * 从单段源码文本里抽出所有 i18n key 引用（库无关全量口径）：函数调用 `t()/$t()`
 * 首参里的字符串字面量（含三元两分支、无插值反引号）、vue `<i18n-t keypath>`/`v-t`
 * （含 `{ path: 'k' }` 形态）、react `<Trans i18nKey>`/`<FormattedMessage id>`/
 * `formatMessage({id})`/`defineMessages({ x: { id } })`。
 *
 * 不做 namespace 剥离、不去重，原样返回每个命中（按出现顺序）。调用方按需归一化/计数。
 * collectUsedKeys（doctor/prune 对账）与 IdReuseResolver（覆盖率分子 + ID 复用）共用，
 * 避免「t()/$t() only」窄正则与本全量口径漂移。传入文本应已剥离注释。
 */
export function scanKeyReferencesInContent(
  content: string,
  options?: { skipBareTranslationCalls?: boolean },
): string[] {
  const refs: string[] = [];

  // 1. 函数调用：取首参表达式里的全部字符串字面量
  const callPattern = options?.skipBareTranslationCalls ? DOLLAR_CALL_FIRST_ARG : CALL_FIRST_ARG;
  callPattern.lastIndex = 0;
  let call: RegExpExecArray | null;
  while ((call = callPattern.exec(content)) !== null) {
    const firstArg = call[1] ?? '';
    STRING_LITERAL.lastIndex = 0;
    let lit: RegExpExecArray | null;
    while ((lit = STRING_LITERAL.exec(firstArg)) !== null) {
      // 组 1=单引号内文 / 组 2=双引号内文 / 组 3=反引号内文，三者必有其一
      const rawKey = lit[1] ?? lit[2] ?? lit[3];
      const key = rawKey === undefined ? undefined : decodeStringLiteralContent(rawKey);
      if (key) refs.push(key); // 空串 key 无意义，跳过（与旧 `+` 量词的非空语义一致）
    }
  }

  // 2. 组件 / 属性形式。ATTR_VALUE 的多个值形态各占一个捕获组，命中的那个即 key。
  const pushFirstGroup = (match: RegExpExecArray): void => {
    for (let i = 1; i < match.length; i++) {
      const group = match[i];
      if (group) {
        refs.push(group);
        return;
      }
    }
  };
  for (const pattern of ATTR_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      pushFirstGroup(match);
    }
  }

  // 3. react-intl 的 defineMessages 定义块：块内每个 id 都是被 formatMessage(messages.x)
  // 间接引用的 key
  DEFINE_MESSAGES_BLOCK.lastIndex = 0;
  let block: RegExpExecArray | null;
  while ((block = DEFINE_MESSAGES_BLOCK.exec(content)) !== null) {
    MESSAGE_DESCRIPTOR_ID.lastIndex = 0;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = MESSAGE_DESCRIPTOR_ID.exec(block[0])) !== null) {
      pushFirstGroup(idMatch);
    }
  }

  return refs;
}

/**
 * 「哪些模块的具名 `t` 导入属于 i18n 来源」的口径：工具注入的全局 t 路径 + i18n 库包名。
 * 与 ReactTextExtractor.hasConflictingTranslationBinding 传给 ReactASTUtils 的同一份口径。
 */
export function resolveI18nModules(config: ResolvedConfig, adapter: FrameworkAdapter): string[] {
  return [config.framework.tImport, adapter.getLibrary().packageName];
}

/**
 * 文件**模块顶层**是否把 `t` 绑定到了非 i18n 来源（`import { t } from './tiny-template'`、
 * `const t = fmt`、`function t() {}`）。命中时该文件里的裸 `t(...)` 首参不是 i18n key。
 *
 * 只看模块顶层：函数内的局部同名绑定只遮蔽自身作用域，整文件停掉裸 t() 的采集面太大。
 * 名字硬编码为 `t`：本模块的调用形态扫描只认 `t(` / `$t(`，react-intl 的 intl.formatMessage
 * 走 ATTR_PATTERNS，与本判定无关。
 *
 * 解析不了（非 TS/JS 扩展名、语法错误）一律返回 false —— 保守方向是「当作 i18n 引用」，
 * 少算 usedKeys 会让 prune 误删在用 key。
 */
/** i18n 组合式入口：其返回值解构出的 `t` 是 i18n 来源，不是本地模板函数。 */
const I18N_COMPOSABLE_NAMES = new Set(['useI18n', 'useTranslation']);

/**
 * 变量声明的初始化表达式是否指向 i18n 来源。
 *
 * 覆盖三类主流写法：`useI18n()/useTranslation()` 调用（含 `x.useI18n()`）、
 * 属性链末端为 `.global` / `.global.t` / `.t`（vue-i18n 组件外用法 `i18n.global.t`）、
 * 以及直接引用 i18n 模块导入进来的标识符。
 */
export function isI18nSourceInitializer(
  initializer: ts.Expression | undefined,
  i18nImportedNames: ReadonlySet<string>,
): boolean {
  if (!initializer) return false;
  let expr: ts.Expression = initializer;
  while (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isNonNullExpression(expr)
  ) {
    expr = expr.expression;
  }
  const calleeName = (node: ts.Expression): string | undefined => {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    return undefined;
  };
  if (ts.isCallExpression(expr)) {
    const name = calleeName(expr.expression);
    if (name && I18N_COMPOSABLE_NAMES.has(name)) return true;
    return ts.isIdentifier(expr.expression) && i18nImportedNames.has(expr.expression.text);
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text === 'global' || expr.name.text === 't';
  }
  if (ts.isIdentifier(expr)) return i18nImportedNames.has(expr.text);
  return false;
}

/** 从 i18n 模块导入进来的本地名（默认导入 / 具名 / 命名空间三种形态）。 */
export function collectI18nImportedNames(
  sourceFile: ts.SourceFile,
  i18nModules: readonly string[],
): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !i18nModules.includes(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) names.add(clause.name.text);
    const named = clause.namedBindings;
    if (!named) continue;
    if (ts.isNamespaceImport(named)) {
      names.add(named.name.text);
    } else {
      for (const el of named.elements) names.add(el.name.text);
    }
  }
  return names;
}

export function hasNonI18nTranslationBinding(
  filePath: string,
  raw: string,
  i18nModules: readonly string[],
): boolean {
  if (!hasExtension(filePath, TS_PARSEABLE_EXTENSIONS)) return false;
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = parseSourceFile(raw, filePath);
  } catch {
    return false;
  }
  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.length > 0) return false;

  // 先过一遍 import：i18n 模块导入的本地名用于判定后续变量声明的初始化来源，
  // import 可以写在变量语句之后，故不能在同一趟循环里边走边收。
  const i18nImportedNames = collectI18nImportedNames(sourceFile, i18nModules);

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name?.text === 't') return true;
      continue;
    }
    if (ts.isImportDeclaration(statement)) {
      if (
        ts.isStringLiteral(statement.moduleSpecifier) &&
        i18nModules.includes(statement.moduleSpecifier.text)
      ) {
        continue;
      }
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name?.text === 't') return true;
      const named = clause.namedBindings;
      if (!named) continue;
      if (ts.isNamespaceImport(named)) {
        if (named.name.text === 't') return true;
      } else if (named.elements.some((el) => el.name.text === 't')) {
        return true;
      }
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      // 初始化表达式指向 i18n 来源（`useI18n()` / `i18n.global` / `i18n.global.t` /
      // i18n 模块导入的标识符）时，绑出的 t 就是 i18n 的 t：判为非 i18n 会让该文件所有裸
      // t() 退出 missing-key 对账，而 store / 工具模块正是 key 最容易写错的地方。
      if (isI18nSourceInitializer(decl.initializer, i18nImportedNames)) continue;
      if (ts.isIdentifier(decl.name)) {
        if (decl.name.text === 't') return true;
      } else if (
        decl.name.elements.some(
          (el) => ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === 't',
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 构造 key 归一函数：把源码里的引用与 locale 里的键名折算到同一比较口径。
 *
 * 两条剥离规则，按 i18n 库对 `ns:key` 的运行时语义分：
 *  - 库把 `ns:key` 当运行时约定（i18next 系，library.supportsNamespace）：locale 按
 *    namespace 分文件、存裸 key，故与工具是否配了 framework.namespace 无关，一律剥掉首个
 *    冒号之前的部分——与 restore 的查表口径（VueRestoreTransformer.lookupText）同源。
 *  - 其余库：冒号是 key 自身的一部分，只剥恰为已配 `framework.namespace` 的前缀。
 *
 * 对账双方都过一遍本函数：源码写 `app:greeting`、locale 存 `greeting`（或反过来）时
 * 两侧都折算成 `greeting`，不会互判为 missing-key / 孤儿——后者会把在用 key 从所有
 * locale 永久删除。
 */
export function createKeyNormalizer(
  config: ResolvedConfig,
  adapter: FrameworkAdapter,
): (key: string) => string {
  if (adapter.getLibrary().supportsNamespace) {
    return (key) => {
      const colonIndex = key.indexOf(':');
      return colonIndex === -1 ? key : key.slice(colonIndex + 1);
    };
  }
  const nsPrefix = config.framework.namespace ? `${config.framework.namespace}:` : '';
  if (!nsPrefix) return (key) => key;
  return (key) => (key.startsWith(nsPrefix) ? key.slice(nsPrefix.length) : key);
}

/**
 * 扫描源码目录，抽出所有 i18n key 引用：函数调用 `t()/$t()`（含三元等首参表达式）、
 * vue 组件/指令 `<i18n-t keypath>`/`v-t`、react 组件/调用 `<Trans i18nKey>`/
 * `<FormattedMessage id>`/`formatMessage({id})`/`defineMessages`。已按 createKeyNormalizer 归一 namespace、
 * 剔除注释中的引用。doctor 对账与 prune 孤儿清理共用此口径，locale 侧比较前需过同一归一。
 *
 * options.skipNonI18nTranslationCalls 只允许 missing-key 检查开启，见其字段说明。
 */
export function collectUsedKeys(
  config: ResolvedConfig,
  adapter: FrameworkAdapter,
  options?: {
    /**
     * 顶层绑定了非 i18n `t` 的文件，其裸 `t(...)` 引用不计入结果。
     *
     * **只有 missing-key 检查可以开**：那些调用的首参根本不是 key，报「locale 不存在该 key」
     * 是误报（error 级，CI 误红）。prune 的孤儿清理与 doctor 的 orphan-key 一律不得开——
     * usedKeys 少算一个在用 key，就等于把它从所有 locale 永久删除。
     */
    skipNonI18nTranslationCalls?: boolean;
  },
): Set<string> {
  const used = new Set<string>();
  const normalize = createKeyNormalizer(config, adapter);
  const i18nModules = options?.skipNonI18nTranslationCalls
    ? resolveI18nModules(config, adapter)
    : [];
  const files = FileUtils.getFrameworkFiles(
    config.io.sourceDir,
    adapter.getSupportedExtensions(),
    config.io.exclude,
    config.io.include,
    config.root,
  );
  const addKey = (raw: string): void => {
    used.add(normalize(raw));
  };
  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const content = stripCommentsForScan(filePath, raw);
      const skipBareTranslationCalls =
        options?.skipNonI18nTranslationCalls === true &&
        hasNonI18nTranslationBinding(filePath, raw, i18nModules);
      for (const ref of scanKeyReferencesInContent(content, { skipBareTranslationCalls })) {
        addKey(ref);
      }
    } catch (error) {
      throw new Error(`读取或扫描源码失败，已中止 key 对账：${filePath}`, { cause: error });
    }
  }
  return used;
}

/** key 是否命中动态 key 白名单（可能被 t(prefix+var) 动态引用，不应判为孤儿）。 */
export function matchesDynamicAllowlist(config: ResolvedConfig, key: string): boolean {
  const list = config.keys.dynamicKeyAllowlist;
  if (list.length === 0) return false;
  for (const pattern of list) {
    if (typeof pattern === 'string') {
      if (key.startsWith(pattern)) return true;
    } else {
      // 用户可能传入带 /g 或 /y 的 RegExp。这些正则的 test() 有状态（lastIndex 在调用间
      // 推进），而本函数会对成百上千个 key 复用同一正则对象，偏移非零时会对本应命中的
      // key 误判 false → 受保护键被当孤儿，从所有 locale 与字典中永久删除（破坏性路径）。
      // 用剥除 g/y 的副本而非把用户对象的 lastIndex 归零：后者是对入参的可观察写操作
      // （同一 RegExp 若还被业务侧自己 exec 复用，状态就被我们改了）。与
      // BaseTextExtractor.isRejectedByConfig / compileMatcher 共用 stripStatefulFlags 这一解法。
      if (stripStatefulFlags(pattern).test(key)) return true;
    }
  }
  return false;
}

/**
 * 「target 有、source 无」的残留 key（doctor 的 stale-target-key 判据）。
 *
 * 成因是源侧 key 被删除或改名而译文没跟着清理。doctor 只报不删，prune 的
 * `--include-stale-target` 才删——两处必须同一判据，否则体检报得出来的条目清理时对不上。
 *
 * 用 hasOwnProperty 而非 `in`：locale map 是 flattenObject 出来的普通对象，`in` 走原型链，
 * 名为 'toString' / 'constructor' 的 key 会被误判为源侧存在而漏掉。
 */
export function findStaleTargetKeys(
  sourceMap: Record<string, unknown>,
  targetMap: Record<string, unknown>,
): string[] {
  return Object.keys(targetMap).filter(
    (key) => !Object.prototype.hasOwnProperty.call(sourceMap, key),
  );
}
