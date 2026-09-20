import ts from 'typescript';

/** 节点前紧邻的最后一段 JSDoc 块注释的字符区间 */
export function jsDocRange(node: ts.Node): ts.CommentRange | undefined {
  const text = node.getSourceFile().text;
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  return ranges
    .filter((r) => r.kind === ts.SyntaxKind.MultiLineCommentTrivia && text.startsWith('/**', r.pos))
    .at(-1);
}

/**
 * JSDoc 正文。按原文逐行取，只在行首的 `@tag` 处收尾：TypeScript 把行中间的 `@aix/popper`
 * 这类写法也当成标签起点，正文会在那里被截断；`{@link X}` 不在行首，原样保留。
 */
export function readJsDocComment(node: ts.Node): string {
  const range = jsDocRange(node);
  if (!range) return '';

  const lines: string[] = [];
  for (const raw of node.getSourceFile().text.slice(range.pos, range.end).split('\n')) {
    const line = raw
      .replace(/^\s*\/\*\*+/, '')
      .replace(/\*\/\s*$/, '')
      .replace(/^\s*\*+ ?/, '');
    if (/^\s*@\w/.test(line)) break;
    lines.push(line);
  }
  return lines.join('\n').trim();
}

export function readJsDocTag(node: ts.Node, tagName: string): string | undefined {
  const tag = ts.getJSDocTags(node).find((t) => t.tagName.text === tagName);
  if (!tag?.comment) return undefined;
  const text =
    typeof tag.comment === 'string' ? tag.comment : (ts.getTextOfJSDocComment(tag.comment) ?? '');
  return text.trim() || undefined;
}

/** 声明连同其 JSDoc 的源码原文 */
export function declarationText(node: ts.Node): string {
  const start = jsDocRange(node)?.pos ?? node.getStart();
  return node.getSourceFile().text.slice(start, node.getEnd());
}
