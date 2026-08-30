import { parse as parseSFC } from '@vue/compiler-sfc';

/**
 * 把改写函数**只**施加到 SFC 的 `<script>` / `<script setup>` 块内容上，template / style
 * 原样保留，改写结果按偏移拼回。
 *
 * Why：import / hook 声明的清理与注入都是正则或整文替换，直接作用于整份 .vue 会伤到
 * `<pre>` / `<code>` 里用户逐字展示的同形文本（示例代码里写 `import { t } from '...'`、
 * `const { t } = useI18n()` 是常见的文档写法），那是不可恢复的内容丢失。script 块是这些
 * 语句唯一可能合法出现的位置，切片后改写即可从结构上杜绝误伤。
 *
 * 解析失败（非 SFC / 语法坏掉）时原样返回：宁可不清理，也不在未知结构上乱改。
 */
export function mapScriptBlocks(code: string, transform: (content: string) => string): string {
  let descriptor;
  try {
    descriptor = parseSFC(code).descriptor;
  } catch {
    return code;
  }

  const edits: Array<{ start: number; end: number; content: string }> = [];
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) continue;
    const updated = transform(block.content);
    if (updated === block.content) continue;
    edits.push({ start: block.loc.start.offset, end: block.loc.end.offset, content: updated });
  }
  if (edits.length === 0) return code;

  // 倒序写入：先改后面的块，前面块的偏移才不会因长度变化而失效
  edits.sort((a, b) => b.start - a.start);
  let out = code;
  for (const { start, end, content } of edits) {
    out = out.slice(0, start) + content + out.slice(end);
  }
  return out;
}
