import { describe, it, expect } from 'vitest';
import { protectStreamingMarkdown } from '../src/utils/markdown';

describe('protectStreamingMarkdown（流式防闪烁）', () => {
  it('空串与完整文本原样返回', () => {
    expect(protectStreamingMarkdown('')).toBe('');
    expect(protectStreamingMarkdown('# 标题\n\n正文完整')).toBe('# 标题\n\n正文完整');
  });

  it('未闭合围栏代码块补收尾围栏', () => {
    expect(protectStreamingMarkdown('```js\nconst a = 1')).toBe('```js\nconst a = 1\n```');
  });

  it('已闭合围栏代码块不改动', () => {
    const src = '```js\nconst a = 1\n```';
    expect(protectStreamingMarkdown(src)).toBe(src);
  });

  it('末行未闭合链接 / 图片起始被隐去', () => {
    expect(protectStreamingMarkdown('详见 [谷歌')).toBe('详见 ');
    expect(protectStreamingMarkdown('![描述')).toBe('');
    // 同一行仅隐去末尾未闭合的那个，已闭合的保留
    expect(protectStreamingMarkdown('[完成] 再看 [半截')).toBe('[完成] 再看 ');
  });

  it('完整链接不被误删', () => {
    const src = '详见 [谷歌](https://g.cn)';
    expect(protectStreamingMarkdown(src)).toBe(src);
  });

  it('仅作用于最后一行，不误伤前文的中括号', () => {
    const src = '[已完成](u) 的内容\n下一行';
    expect(protectStreamingMarkdown(src)).toBe(src);
  });

  describe('未闭合块级数学公式 $$', () => {
    it('流式中途未闭合 $$ 残片被隐去，闭合后恢复', () => {
      // 半截：$$ 出现 1 次（奇数）→ 隐去 $$ 起的残片
      expect(protectStreamingMarkdown('能量方程：$$ \\frac{1}{2}\\rho')).toBe('能量方程：');
      // 闭合：$$ 出现 2 次（偶数）→ 原样保留，交给 KaTeX 渲染
      const closed = '能量方程：$$ \\frac{1}{2}\\rho v^2 $$';
      expect(protectStreamingMarkdown(closed)).toBe(closed);
    });

    it('多个公式时只隐去最后一个未闭合的，已闭合的保留', () => {
      expect(protectStreamingMarkdown('$$a=b$$ 然后 $$c=')).toBe('$$a=b$$ 然后 ');
    });

    it('行内单 $（货币等）不被误伤', () => {
      // 没有 $$ 配对，普通货币文本原样返回
      expect(protectStreamingMarkdown('单价 $5，总价 $10')).toBe('单价 $5，总价 $10');
      expect(protectStreamingMarkdown('便宜 $5')).toBe('便宜 $5');
      // 已闭合的行内公式（成对单 $，无 $$）同样不动
      expect(protectStreamingMarkdown('质能方程 $E=mc^2$ 很有名')).toBe('质能方程 $E=mc^2$ 很有名');
    });
  });

  describe('未闭合块级数学公式 \\[ ... \\]（反斜杠括号写法）', () => {
    it('流式中途未闭合 \\[ 残片被隐去，闭合后恢复', () => {
      // \[ 多于 \] → 隐去 \[ 起的残片
      expect(protectStreamingMarkdown('能量方程：\\[ \\frac{1}{2}\\rho')).toBe('能量方程：');
      // 已闭合 → 原样保留（交给后续归一化 + KaTeX）
      const closed = '能量方程：\\[ \\frac{1}{2}\\rho v^2 \\]';
      expect(protectStreamingMarkdown(closed)).toBe(closed);
    });

    it('多个公式时只隐去最后一个未闭合的', () => {
      expect(protectStreamingMarkdown('\\[a\\] 然后 \\[c=')).toBe('\\[a\\] 然后 ');
    });
  });
});
