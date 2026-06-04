/**
 * 流式 Markdown 防闪烁（正则简化版）：对「尚在输出、可能半截」的文本做最小修整，
 * 让未闭合的语法不至于露出原始标记。仅供流式渲染期使用，最终完整文本应原样渲染。
 *
 * 处理两类高频残片：
 * 1) 未闭合围栏代码块（``` 数量为奇数）：临时补一个收尾围栏，半截代码以代码块渲染，
 *    而非把后续内容误当代码 / 露出裸 ```。
 * 2) 末行未闭合的链接 / 图片起始（`[...` 或 `![...` 尚无配对 `]`）：暂时隐去该残片，
 *    避免流式途中露出裸中括号；token 补全后自然恢复。仅作用于最后一行，避免误伤正文。
 */
export function protectStreamingMarkdown(src: string): string {
  if (!src) return src;
  let out = src;
  // 1) 未闭合围栏代码块
  const fenceCount = (out.match(/^```/gm) ?? []).length;
  if (fenceCount % 2 === 1) {
    out += (out.endsWith('\n') ? '' : '\n') + '```';
  }
  // 2) 末行未闭合的链接/图片起始（限定最后一行，避免把正文里早先的 `[` 连带删除）
  const nl = out.lastIndexOf('\n');
  const head = nl === -1 ? '' : out.slice(0, nl + 1);
  const tail = (nl === -1 ? out : out.slice(nl + 1)).replace(/!?\[[^\]]*$/, '');
  return head + tail;
}
