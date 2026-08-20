import { describe, it, expect } from 'vitest';
import { stripMarkdownForSpeech } from '../src/utils/stripMarkdownForSpeech';

describe('stripMarkdownForSpeech', () => {
  it('去掉标题井号', () => {
    expect(stripMarkdownForSpeech('## 标题文本')).toBe('标题文本');
  });
  it('去掉加粗/斜体标记保留文字', () => {
    expect(stripMarkdownForSpeech('这是 **加粗** 和 *斜体*')).toBe('这是 加粗 和 斜体');
  });
  it('行内代码保留内容去反引号', () => {
    expect(stripMarkdownForSpeech('调用 `foo()` 函数')).toBe('调用 foo() 函数');
  });
  it('链接保留文字去 URL', () => {
    expect(stripMarkdownForSpeech('见 [文档](https://x.com)')).toBe('见 文档');
  });
  it('图片保留 alt 去 URL', () => {
    expect(stripMarkdownForSpeech('![图示](https://x.com/a.png)')).toBe('图示');
  });
  it('去掉无序/有序列表符号', () => {
    expect(stripMarkdownForSpeech('- 第一项\n1. 第二项')).toBe('第一项\n第二项');
  });
  it('去掉引用符号', () => {
    expect(stripMarkdownForSpeech('> 引用内容')).toBe('引用内容');
  });
  it('收敛多余空行并 trim', () => {
    expect(stripMarkdownForSpeech('\n\nA\n\n\n\nB\n\n')).toBe('A\n\nB');
  });
  it('剥离闭合围栏代码块，保留前后正文', () => {
    expect(stripMarkdownForSpeech('示例：\n```js\nconst a = 1;\n```\n完成。')).toBe(
      '示例：\n完成。',
    );
  });
  it('剥离带语言标注的围栏代码块', () => {
    expect(stripMarkdownForSpeech('```python\nprint(1)\n```')).toBe('');
  });
  it('剥离 ~~~ 围栏代码块', () => {
    expect(stripMarkdownForSpeech('前\n~~~\ncode\n~~~\n后')).toBe('前\n后');
  });
  it('未闭合围栏（流式中断）剥到文本末尾', () => {
    expect(stripMarkdownForSpeech('示例：\n```js\nconst a = 1;\nconst b = 2;')).toBe('示例：');
  });
  it('行内代码不跨行配对，不撕裂围栏残片', () => {
    // 围栏先被整体移除，不会残留 ``code`` 之类的反引号碎片
    expect(stripMarkdownForSpeech('调用 `foo()`\n```\nx\n```')).toBe('调用 foo()');
  });
  it('多段代码块各自独立配对剥离', () => {
    expect(stripMarkdownForSpeech('A\n```\nc1\n```\nB\n```\nc2\n```\nC')).toBe('A\nB\nC');
  });

  // 回归：强调符正则曾无边界约束（/(\*|_)(.*?)\1/），把散文里成对出现的下划线与乘号
  // 当作强调标记吃掉，朗读内容与原文不符。与 stripMarkdownForCopy 同口径，二者须同步。
  describe('强调符边界（不吃标识符与乘号）', () => {
    it('保留 snake_case 标识符中的下划线', () => {
      expect(stripMarkdownForSpeech('user_id 和 order_id')).toBe('user_id 和 order_id');
      expect(stripMarkdownForSpeech('my_var_name')).toBe('my_var_name');
      expect(stripMarkdownForSpeech('foo_bar_baz.txt')).toBe('foo_bar_baz.txt');
    });
    it('保留两侧带空格的乘号', () => {
      expect(stripMarkdownForSpeech('2 * 3 * 4')).toBe('2 * 3 * 4');
    });
    it('真正的强调标记仍被剥离', () => {
      expect(stripMarkdownForSpeech('__粗体__ 与 _斜体_')).toBe('粗体 与 斜体');
    });
  });

  // 回归：闭围栏正则曾允许任意尾随文本——围栏内容里的 "```python" 行被误当闭围栏，
  // 其后代码泄入散文剥离流水线（与 stripMarkdownForCopy 同源修复）
  it('围栏内容里的 "```python" 行不被误当闭围栏，整块代码完整移除', () => {
    expect(stripMarkdownForSpeech('前言\n```\n```python\nprint(1)\n```\n之后')).toBe('前言\n之后');
  });
});
