import { CreateAppError } from '../utils/errors';

/** 标记种类 */
type MarkerKind = 'if' | 'else' | 'endif';

interface Marker {
  kind: MarkerKind;
  /** 仅 if 标记有值 */
  expr?: string;
}

/** 特性 id 的合法形态：单个 id 或其取反，不支持 `&&` / `||` */
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
 * 第三种风格的前缀必须是**精确的 `# #`**（一个 `#`、一个空格、再一个 `#`），
 * 以此与 markdown 的一级标题（`# 标题`、`## …`）和普通 `#` 注释区分开：
 * `## #if x`、`#comment #if x` 都不构成标记。
 */
function parseMarker(line: string): Marker | null {
  const trimmed = line.trim();

  if (trimmed === '// #else' || trimmed === '<!-- #else -->' || trimmed === '# #else') {
    return { kind: 'else' };
  }
  if (trimmed === '// #endif' || trimmed === '<!-- #endif -->' || trimmed === '# #endif') {
    return { kind: 'endif' };
  }

  if (trimmed.startsWith('// #if ')) {
    return { kind: 'if', expr: trimmed.slice('// #if '.length).trim() };
  }
  if (trimmed.startsWith('# #if ')) {
    return { kind: 'if', expr: trimmed.slice('# #if '.length).trim() };
  }
  if (trimmed.startsWith('<!-- #if ') && trimmed.endsWith('-->')) {
    const body = trimmed.slice('<!-- #if '.length, -'-->'.length);
    return { kind: 'if', expr: body.trim() };
  }

  return null;
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
 */
function collapseBlankRuns(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}
