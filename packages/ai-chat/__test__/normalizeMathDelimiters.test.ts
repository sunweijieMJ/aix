import { describe, it, expect } from 'vitest';
import { normalizeMathDelimiters } from '../src/utils/markdown';

describe('normalizeMathDelimiters（数学定界符归一化）', () => {
  it('空串原样返回', () => {
    expect(normalizeMathDelimiters('')).toBe('');
  });

  it('块级 \\[...\\] → $$...$$', () => {
    expect(normalizeMathDelimiters('公式 \\[ E=mc^2 \\] 完')).toBe('公式 $$ E=mc^2 $$ 完');
  });

  it('行内 \\(...\\) → $...$', () => {
    expect(normalizeMathDelimiters('其中 \\( \\mathcal{L} \\) 是拉氏量')).toBe(
      '其中 $ \\mathcal{L} $ 是拉氏量',
    );
  });

  it('一段里多个 \\[ \\] 与 \\( \\) 都转换', () => {
    expect(normalizeMathDelimiters('\\[a\\] 和 \\(b\\) 与 \\[c\\]')).toBe('$$a$$ 和 $b$ 与 $$c$$');
  });

  it('已是 $$ / $ 的不受影响', () => {
    const src = '块级 $$x$$ 行内 $y$';
    expect(normalizeMathDelimiters(src)).toBe(src);
  });

  it('代码块 / 行内代码内的反斜杠括号被保护不转换', () => {
    // 围栏代码块内
    const fenced = '```\n\\[ not math \\]\n```';
    expect(normalizeMathDelimiters(fenced)).toBe(fenced);
    // 行内代码内
    const inline = '用 `\\(x\\)` 表示';
    expect(normalizeMathDelimiters(inline)).toBe(inline);
    // 代码外的同时正常转换
    expect(normalizeMathDelimiters('文字 \\(a\\) 和 `\\(b\\)`')).toBe('文字 $a$ 和 `\\(b\\)`');
  });

  it('~~~ 波浪线围栏内的反斜杠括号被保护不转换（与 protectStreamingMarkdown 的 maskCode 围栏策略对齐）', () => {
    const tildeFenced = '~~~\n\\[ not math \\]\n~~~';
    expect(normalizeMathDelimiters(tildeFenced)).toBe(tildeFenced);
    // 带 info 串的 ~~~ 围栏同样保护
    const tildeInfo = '~~~text\n\\( not math \\)\n~~~';
    expect(normalizeMathDelimiters(tildeInfo)).toBe(tildeInfo);
  });

  it('流式半截的未闭合 ``` 围栏内成对反斜杠括号不被瞬时改写', () => {
    const unclosed = '```js\nconst re = "\\[ x \\]";';
    expect(normalizeMathDelimiters(unclosed)).toBe(unclosed);
  });

  it('align* 环境替换为 aligned（KaTeX 兼容）', () => {
    expect(normalizeMathDelimiters('\\[ \\begin{align*} a &= b \\end{align*} \\]')).toBe(
      '$$ \\begin{aligned} a &= b \\end{aligned} $$',
    );
  });

  it('未闭合的残片不转换（留待流式整修 / 后续补全）', () => {
    expect(normalizeMathDelimiters('开始 \\[ E=mc^2')).toBe('开始 \\[ E=mc^2');
  });

  it('LaTeX 行间距 \\\\[2pt] 不被误判为定界符（与 $$ 混用不损坏，回归）', () => {
    expect(normalizeMathDelimiters('$$ a \\\\[2pt] b $$ 然后 \\[x\\]')).toBe(
      '$$ a \\\\[2pt] b $$ 然后 $$x$$',
    );
  });

  it('LaTeX 换行 \\\\ 紧跟括号不被误判为行内定界符', () => {
    expect(normalizeMathDelimiters('矩阵行 a \\\\(b+1) 之后 \\(z\\)')).toBe(
      '矩阵行 a \\\\(b+1) 之后 $z$',
    );
  });
});
