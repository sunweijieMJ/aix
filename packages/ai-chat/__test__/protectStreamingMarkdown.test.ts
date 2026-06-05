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
    it('流式中途未闭合 $$ 残片转为 latex 围栏代码块逐字显示，闭合后恢复', () => {
      // 半截：$$ 出现 1 次（奇数）→ 残片改写为 ```latex 围栏（保留打字反馈、零闪烁）
      expect(protectStreamingMarkdown('能量方程：$$ \\frac{1}{2}\\rho')).toBe(
        '能量方程：\n```latex\n\\frac{1}{2}\\rho\n```',
      );
      // 闭合：$$ 出现 2 次（偶数）→ 原样保留，交给 KaTeX 渲染
      const closed = '能量方程：$$ \\frac{1}{2}\\rho v^2 $$';
      expect(protectStreamingMarkdown(closed)).toBe(closed);
    });

    it('刚输出定界符、残片尚无内容时维持隐藏（避免空代码块一闪）', () => {
      expect(protectStreamingMarkdown('正在推导 $$')).toBe('正在推导 ');
      expect(protectStreamingMarkdown('$$')).toBe('');
    });

    it('多个公式时只改写最后一个未闭合的，已闭合的保留', () => {
      expect(protectStreamingMarkdown('$$a=b$$ 然后 $$c=')).toBe(
        '$$a=b$$ 然后 \n```latex\nc=\n```',
      );
    });

    it('数学残片中的中括号不被末行链接整修误伤', () => {
      // \sqrt[3]{x 的 [3 不能被「未闭合链接」规则吃掉——残片已进入代码围栏
      expect(protectStreamingMarkdown('$$ \\sqrt[3]{x')).toBe('```latex\n\\sqrt[3]{x\n```');
    });

    it('行内单 $（货币等）不被误伤', () => {
      // 没有 $$ 配对，普通货币文本原样返回
      expect(protectStreamingMarkdown('单价 $5，总价 $10')).toBe('单价 $5，总价 $10');
      expect(protectStreamingMarkdown('便宜 $5')).toBe('便宜 $5');
      // 已闭合的行内公式（成对单 $，无 $$）同样不动
      expect(protectStreamingMarkdown('质能方程 $E=mc^2$ 很有名')).toBe('质能方程 $E=mc^2$ 很有名');
    });
  });

  describe('代码区内的数学定界符不参与配对（防止截断代码）', () => {
    it('已闭合代码块内含奇数个 $$ 时代码原样保留', () => {
      const src = '```js\nconst tip = "$$";\n```\n';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('未闭合代码块内含 $$ 时仅补收尾围栏，不动代码内容', () => {
      expect(protectStreamingMarkdown('```js\nconst tip = "$$";')).toBe(
        '```js\nconst tip = "$$";\n```',
      );
    });

    it('行内代码内的 $$ 不参与配对', () => {
      const src = '使用 `$$` 包裹块级公式';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('代码块内的 \\[ 不触发公式整修', () => {
      const src = '```js\nconst re = "\\[";\n```\n';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('代码块之外的未闭合 $$ 仍正常整修', () => {
      expect(protectStreamingMarkdown('```js\na\n```\n$$ x=')).toBe(
        '```js\na\n```\n```latex\nx=\n```',
      );
    });
  });

  describe('未闭合块级数学公式 \\[ ... \\]（反斜杠括号写法）', () => {
    it('流式中途未闭合 \\[ 残片转为 latex 围栏代码块，闭合后恢复', () => {
      expect(protectStreamingMarkdown('能量方程：\\[ \\frac{1}{2}\\rho')).toBe(
        '能量方程：\n```latex\n\\frac{1}{2}\\rho\n```',
      );
      // 已闭合 → 原样保留（交给后续归一化 + KaTeX）
      const closed = '能量方程：\\[ \\frac{1}{2}\\rho v^2 \\]';
      expect(protectStreamingMarkdown(closed)).toBe(closed);
    });

    it('多个公式时只改写最后一个未闭合的', () => {
      expect(protectStreamingMarkdown('\\[a\\] 然后 \\[c=')).toBe(
        '\\[a\\] 然后 \n```latex\nc=\n```',
      );
    });
  });
});
