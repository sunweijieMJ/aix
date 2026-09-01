import { CreateAppError } from '../utils/errors';

/** 标记种类 */
type MarkerKind = 'if' | 'else' | 'endif';

interface Marker {
  kind: MarkerKind;
  /** 仅 if 标记有值 */
  expr?: string;
}

/**
 * 特性 id 的合法形态：单个 id 或其取反，不支持 `&&` / `||`
 *
 * 与 MARKER_PATTERN 一样必须与模板真源自检（`scripts/template/checkTemplate.ts`）同源：
 * 自检那侧一度只取首 token 校验，`// #if i18n 多余文字` 被截成 `i18n` 放行，
 * 真源绿灯而 CLI 在这里硬报 E_TEMPLATE_SYNTAX——所有组合都生成不出来。
 */
const EXPR_PATTERN = /^!?[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * 快路径判定：整篇没有任何标记关键字时可原样返回（含孤立的 #else/#endif 也要进入解析报错）
 *
 * 三种风格的标记里都含有字面的 `#if` / `#else` / `#endif`（`# #if x` 的第二个 `#` 即命中），
 * 所以这一条正则同时覆盖三种风格，新增风格无需改动。
 */
const HAS_MARKER_PATTERN = /#(if|else|endif)\b/;

/**
 * 识别一行是否为条件标记（允许行首缩进）
 *
 * 支持三种注释风格，且不按扩展名区分：
 * - `// #if x` / `// #else` / `// #endif`（js/ts/vue script/scss 等）
 * - `<!-- #if x -->` / `<!-- #else -->` / `<!-- #endif -->`（html/vue template/markdown）
 * - `# #if x` / `# #else` / `# #endif`（dotenv/shell/yaml 等 `#` 注释系文件）
 *
 * 注释符与 `#if` 之间的空白**不限个数**（`//#if x`、`//  #if x` 都认）：这一条必须与
 * 模板真源自检（`scripts/template/checkTemplate.ts`）和 `verify-combos` 的残留检测同源。
 * 历史上这里只认「精确一个空格」，导致 `//#if x` 在自检侧被当标记裁掉、在 CLI 侧却
 * 原样保留——真源绿灯，产物里既留着标记又无条件带上被守卫的代码。
 *
 * `#` 注释系的前缀必须是「`#` + 空白 + `#`」，以此与 markdown 标题（`# 标题`、`## …`）、
 * shebang（`#!/…`）和普通 `#` 注释区分开：`## #if x`、`#comment #if x`、`#if x` 都不构成标记。
 * `#else` / `#endif` 之后的尾随文字（`// #endif 备注`）忽略，不影响判定。
 */
const MARKER_PATTERN = /^(?:\/\/|<!--|#(?=\s))\s*#(if|else|endif)\b(.*)$/;

function parseMarker(line: string): Marker | null {
  const m = MARKER_PATTERN.exec(line.trim());
  if (!m) return null;
  const kind = m[1] as MarkerKind;
  if (kind !== 'if') return { kind };
  // 表达式部分整行捕获后再剥 HTML 注释尾（不能用 `[^>]*` 收窄捕获组：那样
  // `// #if a > b` 会整行不匹配、退化成普通注释，反而把一个写坏的标记藏起来）
  const expr = m[2]!.replace(/-->\s*$/, '').trim();
  return { kind, expr };
}

/** `#if` 引用了模板未声明的特性 id（多半是拼错），单独给报错以免与语法错误混淆 */
function unknownFeatureError(
  filePath: string,
  lineNo: number,
  featureId: string,
  declared: Set<string>,
): CreateAppError {
  const available = [...declared].join(' / ');
  return new CreateAppError(
    'E_TEMPLATE_SYNTAX',
    `条件注释块引用了未声明的特性: ${filePath}:${lineNo} "${featureId}"`,
    available.length > 0
      ? `请检查拼写，或在 .template/config.ts 的 features 中补上该特性（当前可用: ${available}）`
      : '该模板的 .template/config.ts 未声明任何特性，条件块无从求值',
  );
}

function syntaxError(filePath: string, lineNo: number, reason: string): CreateAppError {
  return new CreateAppError(
    'E_TEMPLATE_SYNTAX',
    `条件注释块语法错误: ${filePath}:${lineNo} ${reason}`,
    '条件块语法：`// #if <feature>` / `<!-- #if <feature> -->` / `# #if <feature>`，' +
      '配 `#else`、`#endif`（不支持嵌套与逻辑运算符）',
  );
}

/** 求值单个表达式：`featureId` 或 `!featureId` */
function evaluate(expr: string, selected: Set<string>): boolean {
  return expr.startsWith('!') ? !selected.has(expr.slice(1)) : selected.has(expr);
}

/** 当前正在处理的条件块状态 */
interface BlockState {
  /** if 段是否保留 */
  keepIf: boolean;
  /** 是否已进入 else 段 */
  inElse: boolean;
  /** `#if` 所在行号，用于未闭合报错 */
  startLine: number;
}

/**
 * 按选中特性裁剪文本中的条件注释块
 *
 * 规则见协议 1.2：标记行本身从输出中删除；不支持嵌套；未闭合抛 E_TEMPLATE_SYNTAX。
 * 调用时机：composer 读入文本文件后、变量替换之前。
 */
export function applyConditionalBlocks(
  content: string,
  filePath: string,
  selected: Set<string>,
  /**
   * 模板声明的全部特性 id（即 `manifest.features` 的 key）
   *
   * 对 `#if` 的 id 做**取值域**校验：未声明的 id 直接抛 E_TEMPLATE_SYNTAX。
   * 不校验的话，一个拼错的 id（`#if i18nn`）会被当成「未选中」把整块静默删掉，
   * 产物少一段代码而 CLI 全程零输出——这是本协议里唯一「拼错不报错」的口子。
   * 所以是必选参数：留个缺省口子等于把这道校验做成可绕过的。
   */
  declared: Set<string>,
): string {
  // 无标记的文件走快路径，原样返回（含行尾风格）
  if (!HAS_MARKER_PATTERN.test(content)) return content;

  const lines = content.split('\n');
  const output: string[] = [];
  let block: BlockState | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;
    const marker = parseMarker(line);

    if (marker?.kind === 'if') {
      if (block) throw syntaxError(filePath, lineNo, '不支持嵌套的 #if');
      const expr = marker.expr ?? '';
      if (!EXPR_PATTERN.test(expr)) {
        throw syntaxError(filePath, lineNo, `不支持的条件表达式 "${expr}"`);
      }
      const featureId = expr.startsWith('!') ? expr.slice(1) : expr;
      if (!declared.has(featureId)) {
        throw unknownFeatureError(filePath, lineNo, featureId, declared);
      }
      block = { keepIf: evaluate(expr, selected), inElse: false, startLine: lineNo };
      continue;
    }

    if (marker?.kind === 'else') {
      if (!block) throw syntaxError(filePath, lineNo, '#else 缺少匹配的 #if');
      if (block.inElse) throw syntaxError(filePath, lineNo, '同一条件块中出现多个 #else');
      block.inElse = true;
      continue;
    }

    if (marker?.kind === 'endif') {
      if (!block) throw syntaxError(filePath, lineNo, '#endif 缺少匹配的 #if');
      block = null;
      continue;
    }

    // 普通行：块外全留，块内按当前段的保留状态决定
    if (!block || (block.inElse ? !block.keepIf : block.keepIf)) {
      output.push(line);
    }
  }

  if (block) throw syntaxError(filePath, block.startLine, '#if 未闭合（缺少 #endif）');

  return collapseBlankRuns(output.join('\n'));
}

/**
 * 折叠裁剪留下的连续空行（块被删掉后，其两侧的空行会贴在一起）
 *
 * 规则与 prettier 一致，且只作用于确实含标记的文件——无标记的文件在上游已原样返回。
 *
 * 匹配 `\r?\n` 而非裸 `\n`：CRLF 文件里每行尾都带 `\r`，连续空行的实际形态是
 * `\r\n\r\n\r\n`，只认 `\n{3,}` 的写法一次也匹配不到，折叠对 CRLF 文件整个失效。
 * 回填用块首那一段换行序列复制两份（而不是写死 `\n\n`），以保住原文件的行尾风格。
 */
function collapseBlankRuns(text: string): string {
  return text.replace(/(\r?\n)(?:\r?\n){2,}/g, '$1$1');
}
