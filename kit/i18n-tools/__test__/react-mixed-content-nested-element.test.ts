import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import type { ExtractedString } from '../src/utils/types';

/**
 * 回归（high，数据丢失）：JSX 混合内容（中文文本 + 插值）中的「嵌套元素子节点」
 * 不得被静默丢弃。
 *
 * 根因（修复前）：extractJsxMixedContent 的构建循环只处理 JsxText / JsxExpression，
 * 对 `<div>共 {count} 个 <b>项目</b></div>` 这类同时含插值与嵌套元素的节点，
 * hasExpression 为真触发混合提取，但 <b>项目</b> 既不进 template、reconstruct 也丢弃它，
 * 于是 findExactStringNode 匹配成功、ReactTransformer 替换整个 children 区间，
 * 把嵌套元素及其中文从源码删除且从不写入 locale —— 不可恢复。
 *
 * 修复：检测到嵌套元素子节点即放弃混合内容提取（return null），交回子节点逐个递归，
 * 各自独立提取/转换。宁可碎片化也不丢数据。
 */
describe('React JSX 混合内容含嵌套元素 → 不丢失嵌套中文', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-mixed-nested-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = async (code: string): Promise<{ strings: ExtractedString[]; injected: string }> => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    const injected = adapter.getTransformer().transform(file, strings, code);
    return { strings, injected };
  };

  it('嵌套元素中文被单独提取，且转换后不从源码删除', async () => {
    const code = `import React from 'react';
export function C({ count }: { count: number }) {
  return <div>共 {count} 个 <b>项目</b></div>;
}
`;
    const { strings, injected } = await run(code);

    const texts = strings.map((s) => s.processedMessage || s.original);
    // 嵌套元素中文「项目」必须被提取（修复前会被静默吞掉，这里断言它存在）
    expect(
      texts.some((t) => t.includes('项目')),
      `提取结果：${JSON.stringify(texts)}`,
    ).toBe(true);

    // 转换后：嵌套 <b> 元素必须保留，且其中文被独立国际化（<Trans> / t() 引用），
    // 而非随整段 children 一起被删除。修复前 <b>项目</b> 会从源码消失。
    expect(injected, `转换输出：\n${injected}`).toMatch(
      /<b>\s*(<Trans\s+i18nKey=["']k\d+["']\s*\/?>|\{t\(['"]k\d+['"]\))/,
    );
    // 关键反例：不得把整段 children 折叠成单个占位符而吞掉 <b>
    expect(injected).toContain('<b>');
  });

  it('无嵌套元素的纯混合内容仍走原路径（不被本修复误伤）', async () => {
    const code = `import React from 'react';
export function C({ count }: { count: number }) {
  return <div>共 {count} 个</div>;
}
`;
    const { strings, injected } = await run(code);
    const texts = strings.map((s) => s.processedMessage || s.original);
    // 应作为一条混合内容提取，含 count 占位符
    expect(texts.some((t) => /\{count\}|\$\{count\}/.test(t))).toBe(true);
    expect(injected).toMatch(/<Trans|t\(/);
  });
});
