/**
 * 流式 Markdown 防闪烁（正则简化版）：对「尚在输出、可能半截」的文本做最小修整，
 * 让未闭合的语法不至于露出原始标记。仅供流式渲染期使用，最终完整文本应原样渲染。
 *
 * 处理几类高频残片：
 * 1) 未闭合块级数学公式（`$$` 配对数为奇数，或 `\[` 多于 `\]`）：隐去最后一个未配对的残片，
 *    避免流式途中露出半截裸 LaTeX（如 `$$ \frac{a}`），闭合后自然恢复为公式。
 *    仅处理块级 `$$` / `\[`；行内 `$`（与货币 `$5` 歧义）/ `\(`（较短）不处理。
 * 2) 未闭合围栏代码块（``` 数量为奇数）：临时补一个收尾围栏，半截代码以代码块渲染，
 *    而非把后续内容误当代码 / 露出裸 ```。
 * 3) 末行未闭合的链接 / 图片起始（`[...` 或 `![...` 尚无配对 `]`）：暂时隐去该残片，
 *    避免流式途中露出裸中括号；token 补全后自然恢复。仅作用于最后一行，避免误伤正文。
 */
export function protectStreamingMarkdown(src: string): string {
  if (!src) return src;
  let out = src;
  // 1) 未闭合块级数学公式：$$ 出现奇数次 → 末尾有未闭合块，隐去最后一个 $$ 起的残片
  if ((out.match(/\$\$/g) ?? []).length % 2 === 1) {
    out = out.slice(0, out.lastIndexOf('$$'));
  }
  // 1.5) 未闭合块级数学公式（反斜杠括号写法 \[ ... \]）：\[ 多于 \] → 隐去最后一个 \[ 起的残片，
  //      与 $$ 同理（部分模型用 \[ \] 而非 $$）。行内 \( 较短不处理。
  if ((out.match(/\\\[/g) ?? []).length > (out.match(/\\\]/g) ?? []).length) {
    out = out.slice(0, out.lastIndexOf('\\['));
  }
  // 2) 未闭合围栏代码块
  const fenceCount = (out.match(/^```/gm) ?? []).length;
  if (fenceCount % 2 === 1) {
    out += (out.endsWith('\n') ? '' : '\n') + '```';
  }
  // 3) 末行未闭合的链接/图片起始（限定最后一行，避免把正文里早先的 `[` 连带删除）
  const nl = out.lastIndexOf('\n');
  const head = nl === -1 ? '' : out.slice(0, nl + 1);
  const tail = (nl === -1 ? out : out.slice(nl + 1)).replace(/!?\[[^\]]*$/, '');
  return head + tail;
}

/**
 * 数学公式定界符归一化：把 LaTeX 常见的 `\[...\]`（块级）/ `\(...\)`（行内）转换为
 * KaTeX 插件识别的 `$$...$$` / `$...$`。许多模型（如 OpenAI 系）默认输出反斜杠括号定界符，
 * 而 markdown-it-katex 仅认美元符号，故在启用 KaTeX 时先归一化一次。
 *
 * - 代码块 / 行内代码内的反斜杠括号会被保护，不参与转换（避免误改代码示例）。
 * - 仅转换成对出现的定界符；未闭合残片留待流式整修（见 protectStreamingMarkdown）或后续补全。
 * - 顺带把 KaTeX 不支持的 `align*` 环境替换为 `aligned`（仅出现在 LaTeX 中，替换安全）。
 *   参考 ant-design-x x-markdown 的同款修复（KaTeX#1007）。
 */
export function normalizeMathDelimiters(src: string): string {
  if (!src) return src;
  // 私有区字符占位（非控制字符，规避 no-control-regex；用 fromCodePoint 避免源码内嵌不可见字符）
  const PH = String.fromCodePoint(0xe000);
  const stash: string[] = [];
  // 先抽出代码块与行内代码，避免其中的 \[ \( 被误转
  let out = src
    .replace(/```[\s\S]*?```/g, (m) => `${PH}${stash.push(m) - 1}${PH}`)
    .replace(/`[^`\n]*`/g, (m) => `${PH}${stash.push(m) - 1}${PH}`);
  // \[...\] → $$...$$；\(...\) → $...$（非贪婪仅成对转换；用函数返回值避免 $ 被当替换模式）
  out = out
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `$$${body}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body}$`);
  // KaTeX 不支持 align*，统一替换为 aligned（{align*} 仅出现在 LaTeX，代码区已被占位保护）
  out = out.replace(/\{align\*\}/g, '{aligned}');
  // 还原代码占位
  return out.replace(
    new RegExp(`${PH}(\\d+)${PH}`, 'g'),
    (_m, i: string) => stash[Number(i)] ?? '',
  );
}
