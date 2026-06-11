import { describe, it, expect } from 'vitest';
import { protectStreamingMarkdown } from '../src/utils/markdown';

describe('protectStreamingMarkdown（流式防闪烁）', () => {
  it('空串与完整文本原样返回', () => {
    expect(protectStreamingMarkdown('')).toBe('');
    expect(protectStreamingMarkdown('# 标题\n\n正文完整')).toBe('# 标题\n\n正文完整');
  });

  it('~~~ 波浪线围栏内的 $$ 不参与数学配对（如 shell 的 $$ PID 变量）', () => {
    const src = '~~~bash\necho $$\n~~~\n说明文字';
    expect(protectStreamingMarkdown(src)).toBe(src);
  });

  it('未闭合 ~~~ 围栏补等长收尾围栏', () => {
    expect(protectStreamingMarkdown('~~~bash\necho hi')).toBe('~~~bash\necho hi\n~~~');
  });

  it('4 反引号嵌套围栏：补的收尾围栏与开围栏等长（``` 不落入外层内容形成残影）', () => {
    expect(protectStreamingMarkdown('````markdown\n```js\ncode\n```')).toBe(
      '````markdown\n```js\ncode\n```\n````',
    );
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

  it('已闭合行内代码中的 [ 不触发链接整修（回归：`arr[` 等编程话题被误删尾部）', () => {
    const src = '写 `arr[` 开始索引即可';
    expect(protectStreamingMarkdown(src)).toBe(src);
  });

  it('行内代码之后真正的链接残片仍被隐去', () => {
    expect(protectStreamingMarkdown('见 `code[0]` 和 [链接残')).toBe('见 `code[0]` 和 ');
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

  describe('表格残片：表头先行成表（补合成分隔行）', () => {
    it('仅表头到达：按表头列数补合成分隔行，立即渲染为表头表格', () => {
      expect(protectStreamingMarkdown('介绍：\n\n| 名称 | 数量 |')).toBe(
        '介绍：\n\n| 名称 | 数量 |\n| --- | --- |',
      );
    });

    it('半截表头（无尾竖线）同样补分隔行', () => {
      expect(protectStreamingMarkdown('| 名称 | 数量')).toBe('| 名称 | 数量\n| --- | --- |');
    });

    it('半截分隔行被替换为完整合成分隔行', () => {
      expect(protectStreamingMarkdown('| 名称 | 数量 |\n| ---')).toBe(
        '| 名称 | 数量 |\n| --- | --- |',
      );
    });

    it('分隔行已完整时不改动', () => {
      const src = '| 名称 | 数量 |\n| :-- | --: |';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('已有数据行的表格不改动（markdown-it 可正常渐进渲染）', () => {
      const src = '| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 3';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('表头含转义竖线 \\| 时按 escapedSplit 语义计列（\\| 是单元格内容不算列分隔）', () => {
      // markdown-it 视 '| a\|b | c |' 为 2 列，朴素 split('|') 会误计 3 列
      expect(protectStreamingMarkdown('| a\\|b | c |')).toBe('| a\\|b | c |\n| --- | --- |');
    });

    it('表头含 \\| 且分隔行已完整合法时不改动（不被错误列数判定破坏，回归）', () => {
      const src = '| a\\|b | c |\n| --- | --- |';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('代码块内的竖线行不触发表格整修', () => {
      expect(protectStreamingMarkdown('```text\n| a | b |')).toBe('```text\n| a | b |\n```');
    });

    it('行首非竖线的普通文本不误伤', () => {
      const src = '价格 a | b 对比';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });
  });

  describe('末行行内残片：隐定界符、留文本（保打字反馈）', () => {
    it('未闭合 HTML/组件标签残片被隐去', () => {
      expect(protectStreamingMarkdown('点击 <MyCard title="he')).toBe('点击 ');
      expect(protectStreamingMarkdown('结束 </div')).toBe('结束 ');
    });

    it('小于号后非字母（数学不等式）不误伤', () => {
      const src = '不等式 a < b 且 1<2 成立';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('未闭合行内代码：隐去孤立反引号、保留文本', () => {
      expect(protectStreamingMarkdown('用 `code 标记')).toBe('用 code 标记');
      // 已闭合的行内代码原样保留，只处理孤立的那个
      expect(protectStreamingMarkdown('`a` 和 `b')).toBe('`a` 和 b');
    });

    it('未闭合粗体/删除线：隐去定界符、保留文本', () => {
      expect(protectStreamingMarkdown('这是 **重要内容')).toBe('这是 重要内容');
      expect(protectStreamingMarkdown('**已完成** 而 **半截')).toBe('**已完成** 而 半截');
      expect(protectStreamingMarkdown('删除 ~~过时内容')).toBe('删除 过时内容');
    });

    it('已配对的粗体不改动', () => {
      const src = '这是 **重要** 内容';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('已配对粗体的闭合符后紧跟中文标点不被误删（回归）', () => {
      const src = '结论是 **数量充足**，详见下表';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('跨行配对的粗体不被误删（配对按全文计数）', () => {
      const src = '**重要\n内容**';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('未闭合单星/下划线：仅当定界符前是行首或空白才处理（防乘法/snake_case 误伤）', () => {
      expect(protectStreamingMarkdown('单独 *强调文本')).toBe('单独 强调文本');
      expect(protectStreamingMarkdown('运算 2*3 的结果')).toBe('运算 2*3 的结果');
      expect(protectStreamingMarkdown('变量 snake_case 命名')).toBe('变量 snake_case 命名');
    });

    it('行首列表标记 `* ` 不被当作未闭合强调误删（回归：流式新列表项）', () => {
      expect(protectStreamingMarkdown('列表项\n* 列表残片')).toBe('列表项\n* 列表残片');
      expect(protectStreamingMarkdown('功能列表：\n* 支持流式')).toBe('功能列表：\n* 支持流式');
      expect(protectStreamingMarkdown('- 第一项\n* 第二')).toBe('- 第一项\n* 第二');
      // 缩进子列表的 `* ` 同样保留
      expect(protectStreamingMarkdown('列表：\n  * 子项')).toBe('列表：\n  * 子项');
    });

    it('空白环绕的孤立星号/下划线（乘号、分隔符写法）不被误删', () => {
      // `* ` 后随空白不可能是强调起始符（CommonMark 左侧定界符不能后随空白），应原样保留
      expect(protectStreamingMarkdown('结果是 3 * 4')).toBe('结果是 3 * 4');
      expect(protectStreamingMarkdown('数值 _ 单位')).toBe('数值 _ 单位');
    });

    it('行内代码里的星号/小于号不参与残片判定', () => {
      const src = '代码 `a*b` 和 `x<y` 示例';
      expect(protectStreamingMarkdown(src)).toBe(src);
    });

    it('仅作用于末行，前文的残片样式不被误伤', () => {
      const src = '前文 **未闭合\n新的一行';
      expect(protectStreamingMarkdown(src)).toBe(src);
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

    it('LaTeX 行间距 \\\\[2pt] 的 \\[ 不被误判为定界符：已闭合公式不被撕裂（回归）', () => {
      // aligned/cases 环境的标准行距写法 \\[2pt]：$$ 已配对、无需任何整修
      const closed = '$$\\begin{aligned}a\\\\[2pt]b=c\\end{aligned}$$\n后续正文';
      expect(protectStreamingMarkdown(closed)).toBe(closed);
    });

    it('\\\\[2pt] 与真正未闭合的 \\[ 共存时，只整修真定界符起的残片', () => {
      expect(protectStreamingMarkdown('$$a\\\\[2pt]b$$ 然后 \\[c=')).toBe(
        '$$a\\\\[2pt]b$$ 然后 \n```latex\nc=\n```',
      );
    });
  });
});
