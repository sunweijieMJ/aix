import { parse as parseSFC } from '@vue/compiler-sfc';

/**
 * `<template lang="...">` 是否是本工具能处理的 HTML 模板。
 *
 * 缺省（无 lang）与 `html` 之外的值（pug / jade / haml…）都是另一套语法：
 * @vue/compiler-dom 会把整块当成一个 TEXT 节点，按 HTML 规则提取 / 替换 / 还原都会把
 * 整段模板换成一句 `{{ $t(...) }}`，且不可逆。三端（提取 / 转换 / 还原）据此整块跳过。
 */
export function isHtmlTemplateLang(lang: string | undefined): boolean {
  return !lang || lang.toLowerCase() === 'html';
}

/**
 * `<script lang="...">` 内容送进 TS 解析器时用的虚拟文件名。
 *
 * parseSourceFile 由扩展名推 ScriptKind，而块内容脱离了 .vue 文件名。tsx / jsx 块必须按
 * JSX 语法解析：按 TS 解析时 `<div a="x">` 会被当成类型断言，AST 与源码结构对不上，
 * 属性里的字面量被替换成裸 `t('k')`（JSX 属性值必须是字符串或 `{表达式}`）产出语法错误。
 * 提取 / 转换 / 还原三处必须取同一个名字，否则同一段源码在三端得到不同的 AST。
 */
export function scriptFileNameOfLang(lang: string | undefined): string {
  const normalized = (lang ?? '').toLowerCase();
  return normalized === 'tsx' || normalized === 'jsx' ? 'sfc.tsx' : 'sfc.ts';
}

/**
 * 开标签源码（或其属性段）里是否声明了 v-pre 指令。
 *
 * @vue/compiler-dom 在 parse 阶段消费 v-pre 并从 props 移除（不保留 DIRECTIVE 节点），
 * 只能扫源码。匹配前先把引号包裹的属性值整体抹平：仅靠属性名锚定的正则不够，值里空白
 * 分隔的 `v-pre`（如 `:data-tip="'enable v-pre mode'"`）会让整棵子树被误判为 v-pre。
 *
 * 提取端（跳过子树不提取）与还原端（逐字区 stash）必须同口径，否则一端保护、另一端改写。
 */
export function sourceDeclaresVPre(openTagSource: string): boolean {
  return /(?:^|\s)v-pre(?=[\s/>=]|$)/.test(openTagSource.replace(/"[^"]*"|'[^']*'/g, '""'));
}

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
