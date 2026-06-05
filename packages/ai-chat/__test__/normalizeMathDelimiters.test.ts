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

  it('align* 环境替换为 aligned（KaTeX 兼容）', () => {
    expect(normalizeMathDelimiters('\\[ \\begin{align*} a &= b \\end{align*} \\]')).toBe(
      '$$ \\begin{aligned} a &= b \\end{aligned} $$',
    );
  });

  it('未闭合的残片不转换（留待流式整修 / 后续补全）', () => {
    expect(normalizeMathDelimiters('开始 \\[ E=mc^2')).toBe('开始 \\[ E=mc^2');
  });
});
