/**
 * 把 markdown 源切成「顶层块」的源码切片，供流式按块提交/冻结与独立渲染。
 *
 * 依据 markdown-it 的 token 行范围（`token.map = [startLine, endLine)`）切片：
 * 只取 `level === 0` 的块级开启/自闭合 token（段落/标题/列表/围栏/表格/引用/hr/html_block…），
 * 每个顶层块取其覆盖的源码行；块之间的空行分隔被丢弃（块级渲染由 CSS 间距处理）。
 *
 * 不静态依赖 markdown-it 类型，只声明所需的最小结构，保持与"动态加载 markdown-it"解耦。
 */
import { htmlBlockRunEnd, type MdToken } from './markdownWalker';

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
  // 顶层（level 0）的块级开启（nesting 1）或自闭合（nesting 0）token 携带 map → 即一个顶层块
  const topLevel = tokens.filter((t) => t.level === 0 && t.nesting >= 0 && t.map);
  const blocks: string[] = [];
  for (let i = 0; i < topLevel.length; i++) {
    const t = topLevel[i]!;
    // 合并相邻的 html_block：CommonMark 的 html_block 规则按标签名 / 空行切割，一份完整原始
    // HTML 文档（未走 ```html 围栏）几乎必然被文档内部的空行切成多个顶层块（如 <!DOCTYPE html>
    // 单独一行即因本行含 `>` 立即收尾，紧邻的 <html> 又要等到下个空行才收尾）。这里把连续出现
    // 的 html_block 顶层块重新拼回一个源码切片，交给同一个 <MarkdownBlock> 渲染；该切片独立
    // 重新解析（parseBlock）后仍会产出多个 html_block token（空行还在），故 walker 层的
    // renderMarkdownTokens 还需再做一次同样的合并（htmlBlockRunEnd 是两处共用的游程边界定义，
    // 见其注释）——两处合并针对不同粒度（组件实例 vs token），缺一处都会重新裂开。
    const endIdx = t.type === 'html_block' ? htmlBlockRunEnd(topLevel, i) : i;
    const last = topLevel[endIdx]!;
    // 去掉尾随空行（markdown-it 的列表等块 map 会含尾随空行，属分隔符非内容）
    blocks.push(lines.slice(t.map![0], last.map![1]).join('\n').replace(/\n+$/, ''));
    i = endIdx;
  }
  return blocks;
}
