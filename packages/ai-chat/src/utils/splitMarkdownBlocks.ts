/**
 * 把 markdown 源切成「顶层块」的源码切片，供流式按块提交/冻结与独立渲染。
 *
 * 依据 markdown-it 的 token 行范围（`token.map = [startLine, endLine)`）切片：
 * 只取 `level === 0` 的块级开启/自闭合 token（段落/标题/列表/围栏/表格/引用/hr/html_block…），
 * 每个顶层块取其覆盖的源码行；块之间的空行分隔被丢弃（块级渲染由 CSS 间距处理）。
 *
 * 不静态依赖 markdown-it 类型，只声明所需的最小结构，保持与"动态加载 markdown-it"解耦。
 */
import type { MdToken } from './markdownWalker';

/** markdown-it 实例的最小解析能力（token 与 walker 共用 MdToken） */
export interface MarkdownBlockParser {
  parse(src: string, env: unknown): MdToken[];
}

/**
 * @param env 透传给 md.parse 的解析环境：调用方可借它收集全文的引用式链接定义
 *            （markdown-it 写入 env.references），再注入各块的独立解析。
 */
export function splitMarkdownBlocks(
  md: MarkdownBlockParser,
  src: string,
  env: unknown = {},
): string[] {
  if (!src) return [];
  const tokens = md.parse(src, env);
  const lines = src.split('\n');
  const blocks: string[] = [];
  for (const t of tokens) {
    // 顶层（level 0）的块级开启（nesting 1）或自闭合（nesting 0）token 携带 map → 即一个顶层块
    if (t.level === 0 && t.nesting >= 0 && t.map) {
      // 去掉尾随空行（markdown-it 的列表等块 map 会含尾随空行，属分隔符非内容）
      blocks.push(lines.slice(t.map[0], t.map[1]).join('\n').replace(/\n+$/, ''));
    }
  }
  return blocks;
}
