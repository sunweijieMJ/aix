/**
 * 流式 Markdown 防闪烁（正则简化版）：对「尚在输出、可能半截」的文本做最小修整，
 * 让未闭合的语法不至于露出原始标记。仅供流式渲染期使用，最终完整文本应原样渲染。
 *
 * 处理几类高频残片：
 * 1) 未闭合块级数学公式（`$$` 配对数为奇数，或 `\[` 多于 `\]`）：把最后一个未配对的残片
 *    改写为 ```latex 围栏代码块——逐字输出全程可见（保留打字机反馈、等宽零闪烁），
 *    闭合后该分支不再命中，整段交还 KaTeX 渲染为公式（经 TransitionGroup 淡入）。
 *    残片尚无内容（刚输出定界符本身）时维持隐藏，避免空代码块一闪。
 *    仅处理块级 `$$` / `\[`；行内 `$`（与货币 `$5` 歧义）/ `\(`（较短）不处理。
 * 2) 未闭合围栏代码块（逐行扫描 ```/~~~ 开闭围栏）：临时补一个与开围栏等长的收尾围栏，
 *    半截代码以代码块渲染，而非把后续内容误当代码 / 露出裸 ```（也负责闭合上面新开的
 *    latex 围栏；嵌套围栏如 ````markdown 内嵌 ```js 按外层长度补，不产生残影）。
 * 3) 末行未闭合的链接 / 图片起始（`[...` 或 `![...` 尚无配对 `]`）：暂时隐去该残片，
 *    避免流式途中露出裸中括号；token 补全后自然恢复。仅作用于最后一行，避免误伤正文；
 *    数学残片已改写为围栏时跳过（末行是 LaTeX，`\sqrt[3]{x` 等中括号不能被误删）；
 *    定位在代码遮蔽后的文本上进行（已闭合行内代码中的 `[` 如 `arr[` 不算链接起始）。
 * 4) 表格残片（表头已现而分隔行未到）：按表头列数补一行合成分隔行，让表头**先行成表**——
 *    避免「裸竖线文本可见 → 分隔行到达瞬间突变成表格」的跳变（借鉴 ant-design-x 的
 *    残片不裸奔原则，但用渐进成表替代其扣住不显示）。分隔行之后 markdown-it 本就能
 *    逐行渐进渲染数据行，无需处理。
 * 5) 末行行内残片（未闭合 HTML 标签 / 行内代码反引号 / 粗体删除线强调）：隐去定界符、
 *    保留文本逐字显示，闭合后整体变样式。单 `*`/`_` 仅在「前为行首或空白、后非空白」时处理，
 *    防乘法 `2*3`、`snake_case`、行首列表标记 `* `、空白环绕乘号 `3 * 4` 误伤；
 *    检测均在代码遮蔽后的文本上进行。
 */
export function protectStreamingMarkdown(src: string): string {
  if (!src) return src;
  let out = src;
  let mathFenced = false;

  /** 把 idx 起（跳过 delimLen 长度的定界符）的未闭合公式残片改写为 latex 围栏代码块 */
  const fenceMathResidual = (idx: number, delimLen: number) => {
    const body = out.slice(idx + delimLen).trimStart();
    const prefix = out.slice(0, idx);
    if (!body) {
      // 残片还没有内容：维持隐藏（空代码块没有展示价值，反而一闪）
      out = prefix;
      return;
    }
    const sep = prefix === '' || prefix.endsWith('\n') ? '' : '\n';
    out = `${prefix}${sep}\`\`\`latex\n${body}`;
    mathFenced = true;
  };

  // 数学定界符的计数/定位先对代码区做等长遮蔽（闭合围栏、末尾未闭合围栏、行内代码），
  // 避免代码里的 $$ / \[ 被误当公式定界符导致截断代码；等长替换保证索引与 out 对齐。
  // 与 normalizeMathDelimiters 的代码区保护同一策略，此处因需要 lastIndexOf 原文索引故用遮蔽而非抽出。
  const maskCode = (s: string): string =>
    s
      .replace(/(`{3,}|~{3,})[\s\S]*?(?:\1|$)/g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, ' '));
  let masked = maskCode(out);

  // 1) 未闭合块级数学公式：$$ 出现奇数次 → 末尾有未闭合块，改写最后一个 $$ 起的残片
  if ((masked.match(/\$\$/g) ?? []).length % 2 === 1) {
    fenceMathResidual(masked.lastIndexOf('$$'), 2);
    // out 已被改写（残片进入未闭合 latex 围栏），重算遮蔽，避免残片内的 \[ 再次触发整修
    masked = maskCode(out);
  }
  // 1.5) 未闭合块级数学公式（反斜杠括号写法 \[ ... \]）：\[ 多于 \] → 改写最后一个 \[ 起的残片，
  //      与 $$ 同理（部分模型用 \[ \] 而非 $$）。行内 \( 较短不处理。
  //      负向后行断言排除前面还有反斜杠的场景：LaTeX 行间距 \\[2pt]（aligned/cases 环境
  //      标准行距写法）的 \[ 不是定界符，否则已闭合公式会被持续撕裂。
  const delimIdxs = (s: string, re: RegExp): number[] => {
    const idxs: number[] = [];
    for (let m = re.exec(s); m; m = re.exec(s)) idxs.push(m.index);
    return idxs;
  };
  {
    const opens = delimIdxs(masked, /(?<!\\)\\\[/g);
    if (opens.length > delimIdxs(masked, /(?<!\\)\\\]/g).length) {
      fenceMathResidual(opens[opens.length - 1]!, 2);
    }
  }
  // 1.7) 表格残片：末块「表头已现而分隔行未到」时补合成分隔行，表头先行成表。
  //      末块 = 最后一个空行之后的内容；首行须以 | 开头（按遮蔽后判定，代码区内竖线不算）。
  masked = maskCode(out);
  {
    const bs = masked.lastIndexOf('\n\n');
    const blockStart = bs === -1 ? 0 : bs + 2;
    const maskedFirst = masked.slice(blockStart).split('\n')[0] ?? '';
    if (maskedFirst.trimStart().startsWith('|')) {
      const lines = out.slice(blockStart).split('\n');
      const header = lines[0] ?? '';
      // 列数 = 表头去首尾竖线后的分段数；全空段（如单个 '|'）不处理。
      // 切列前先把转义竖线 \| 替换为占位符：GFM/markdown-it 按转义感知切分（escapedSplit），
      // \| 属单元格内容不算列分隔，朴素 split('|') 会多计列数（仅用于计数，无需还原内容）。
      const toCells = (l: string) =>
        l.trim().replace(/\\\|/g, '\0').replace(/^\|/, '').replace(/\|$/, '').split('|');
      const segs = toCells(header);
      if (segs.some((s) => s.trim())) {
        const synth = `| ${segs.map(() => '---').join(' | ')} |`;
        // 形似分隔行：仅由 空白/|/:/- 组成且含 -；合法完整分隔行：列数匹配且每列 :?-+:?
        const isSepish = (l: string) => /^[\s|:-]*$/.test(l) && l.includes('-');
        const isValidSep = (l: string) => {
          // 与表头同一转义感知切分，保证列数比较口径一致
          const cells = toCells(l);
          return (
            l.trim().endsWith('|') &&
            cells.length === segs.length &&
            cells.every((c) => /^:?-+:?$/.test(c.trim()))
          );
        };
        if (lines.length === 1) {
          // 仅表头：直接补合成分隔行
          out = `${out}\n${synth}`;
        } else if (lines.length === 2 && isSepish(lines[1] ?? '') && !isValidSep(lines[1] ?? '')) {
          // 半截/非法分隔行：替换为合成分隔行（合法完整的保留原样，含对齐冒号）
          out = `${out.slice(0, blockStart)}${header}\n${synth}`;
        }
      }
    }
  }
  // 2) 未闭合围栏代码块（含上面新开的 latex 围栏；``` 与 ~~~，开围栏可为 3+ 字符）：
  //    逐行跟踪开/闭围栏（闭围栏须同字符、不短于开围栏、无 info 文本），未闭合时补
  //    等长收尾围栏——嵌套场景（````markdown 内嵌 ```js）固定补 ``` 会因短于外层
  //    开围栏而落入其内容形成残影，必须按开围栏原样补。
  let openFence = '';
  for (const line of out.split('\n')) {
    const m = /^(`{3,}|~{3,})(.*)$/.exec(line);
    if (!m) continue;
    if (!openFence) openFence = m[1]!;
    else if (m[1]![0] === openFence[0] && m[1]!.length >= openFence.length && !m[2]!.trim())
      openFence = '';
  }
  if (openFence) {
    out += (out.endsWith('\n') ? '' : '\n') + openFence;
  }
  // 3) 末行未闭合的链接/图片起始（限定最后一行，避免把正文里早先的 `[` 连带删除）；
  //    数学残片围栏内是 LaTeX，跳过以免误删其中括号与星号等
  if (mathFenced) return out;
  const nl = out.lastIndexOf('\n');
  const head = nl === -1 ? '' : out.slice(0, nl + 1);
  let tail = nl === -1 ? out : out.slice(nl + 1);
  // 3/4) 末行残片检测统一在遮蔽后末行上做（行内代码里的 [ < ` * 不参与），
  //      遮蔽等长故索引与 tail 对齐；3/4a/4b 同步双切保持后续步骤对齐。
  let maskedTail = maskCode(head + tail).slice(head.length);
  // 3) 链接/图片残片定位：已闭合行内代码中的 [（如 `arr[`）已被遮蔽，不会误删其后文本
  const linkIdx = maskedTail.search(/!?\[[^\]]*$/);
  if (linkIdx !== -1) {
    tail = tail.slice(0, linkIdx);
    maskedTail = maskedTail.slice(0, linkIdx);
  }
  // 4a) 未闭合 HTML/组件标签（`<` 后紧跟字母或 /）：隐去残片；`a < b`、`1<2` 不命中
  const htmlIdx = maskedTail.search(/<\/?[a-zA-Z][^>\n]*$/);
  if (htmlIdx !== -1) {
    tail = tail.slice(0, htmlIdx);
    maskedTail = maskedTail.slice(0, htmlIdx);
  }
  // 4b) 未闭合行内代码：孤立反引号（完整对已被遮蔽）删除、保留其后文本
  //     （此后步骤改用重新遮蔽的 mAll 判定，maskedTail 无需再同步）
  if ((maskedTail.match(/`/g) ?? []).length % 2 === 1) {
    const bi = maskedTail.lastIndexOf('`');
    tail = tail.slice(0, bi) + tail.slice(bi + 1);
  }
  // 4c) 未闭合强调/删除线：按**全文遮蔽后**的配对计数判定——计数为偶即全部配对不动；
  //     为奇说明有落单定界符，且仅当落单者（最后一个）位于末行时删除它、保留文本。
  //     全文计数（而非末行）是为了不误删跨行配对的闭合符（开符在前面行的场景）。
  let mAll = maskCode(head + tail);
  const stripUnpaired = (re: RegExp, dLen: number, needSpaceBefore: boolean) => {
    const idxs: number[] = [];
    for (let m = re.exec(mAll); m; m = re.exec(mAll)) idxs.push(m.index);
    if (idxs.length % 2 === 0) return; // 全部配对（或没有）
    const at = idxs[idxs.length - 1]!;
    if (at < head.length) return; // 落单者不在末行：不越界处理（与链接整修同范围）
    if (needSpaceBefore && at > 0 && !/\s/.test(mAll[at - 1]!)) return;
    // 后随空白的单定界符不可能成为强调：CommonMark 左侧定界符不能后随空白（开不了），
    // 而 needSpaceBefore 已限定其前为空白（闭不了）——必然按字面渲染、无闪烁，保留不动。
    // 典型场景：行首列表标记 `* `（删掉会让流式新列表项丢 bullet 一帧）、乘号 `3 * 4`。
    if (needSpaceBefore && /\s/.test(mAll[at + dLen] ?? '')) return;
    const rel = at - head.length;
    tail = tail.slice(0, rel) + tail.slice(rel + dLen);
    mAll = mAll.slice(0, at) + mAll.slice(at + dLen);
  };
  // 双波浪线 / 双星：词内合法（中文紧贴场景常见），无需前置空白
  stripUnpaired(/~~/g, 2, false);
  stripUnpaired(/\*\*/g, 2, false);
  // 单星 / 下划线：仅行首或空白后（防乘法 2*3、snake_case 误伤）
  stripUnpaired(/(?<!\*)\*(?!\*)/g, 1, true);
  stripUnpaired(/(?<!_)_(?!_)/g, 1, true);
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
  // 先抽出代码块与行内代码，避免其中的 \[ \( 被误转。
  // 围栏正则与 protectStreamingMarkdown 的 maskCode 对齐：同时覆盖 ``` 与 ~~~ 围栏
  // （markdown-it 两者皆合法），以及流式期间未闭合到 EOF 的围栏（\1 反向引用要求
  // 闭围栏与开围栏完全一致，或以 $ 兜底到文本末尾），避免这些代码区内的 \[ \] 被误转。
  let out = src
    .replace(/(`{3,}|~{3,})[\s\S]*?(?:\1|$)/g, (m) => `${PH}${stash.push(m) - 1}${PH}`)
    .replace(/`[^`\n]*`/g, (m) => `${PH}${stash.push(m) - 1}${PH}`);
  // \[...\] → $$...$$；\(...\) → $...$（非贪婪仅成对转换；用函数返回值避免 $ 被当替换模式）。
  // 负向后行断言排除被反斜杠转义的场景：LaTeX 行间距 \\[2pt] / 换行 \\ 紧跟括号
  // 不是定界符，否则误配对会把已闭合公式永久损坏。
  out = out
    .replace(/(?<!\\)\\\[([\s\S]+?)(?<!\\)\\\]/g, (_m, body: string) => `$$${body}$$`)
    .replace(/(?<!\\)\\\(([\s\S]+?)(?<!\\)\\\)/g, (_m, body: string) => `$${body}$`);
  // KaTeX 不支持 align*，统一替换为 aligned（{align*} 仅出现在 LaTeX，代码区已被占位保护）
  out = out.replace(/\{align\*\}/g, '{aligned}');
  // 还原代码占位
  return out.replace(
    new RegExp(`${PH}(\\d+)${PH}`, 'g'),
    (_m, i: string) => stash[Number(i)] ?? '',
  );
}
