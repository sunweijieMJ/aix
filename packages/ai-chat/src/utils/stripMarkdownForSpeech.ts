import { CLOSED_FENCE_RE, stripInlineProse } from './stripMarkdownShared';

/**
 * 将 markdown 文本轻量剥离为适合朗读的纯文本：
 * 去围栏代码块、标题井号、强调符、行内代码反引号、链接/图片保留文字、列表/引用符号、水平线，收敛空行。
 * 仅做朗读体验优化，非完备 markdown 解析。text 块承载含围栏的 markdown 源，故先整体移除围栏
 * 代码块（含流式中断的未闭合围栏），避免整段代码被逐字朗读；思维链 / 来源块属独立块类型，天然不进此文本。
 * 散文级语法剥离与 stripMarkdownForCopy 共用 stripInlineProse（见 stripMarkdownShared）。
 */
export const stripMarkdownForSpeech = (md: string): string =>
  stripInlineProse(
    md
      // 围栏代码块 ```lang ... ``` / ~~~ ... ~~~（含语言标注行）→ 整体移除（须先于行内代码处理）
      .replace(CLOSED_FENCE_RE, '')
      // 未闭合围栏（流式中断）→ 从围栏起剥到文本末尾
      .replace(/^[ \t]{0,3}(`{3,}|~{3,})[\s\S]*$/gm, '')
      // 行内代码 `code` → code（限单行内配对，不跨行撕裂围栏残片）
      .replace(/`([^`\n]+)`/g, '$1'),
  )
    // 多余空白行收敛为至多一个空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
