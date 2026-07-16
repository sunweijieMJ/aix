import { describe, it, expect } from 'vitest';
import { stripMarkdownForCopy } from '../src/utils/stripMarkdownForCopy';

describe('stripMarkdownForCopy', () => {
  it('去掉标题井号', () => {
    expect(stripMarkdownForCopy('## 标题文本')).toBe('标题文本');
  });
  it('去掉加粗/斜体标记保留文字', () => {
    expect(stripMarkdownForCopy('这是 **加粗** 和 *斜体*')).toBe('这是 加粗 和 斜体');
  });
  it('行内代码保留内容去反引号', () => {
    expect(stripMarkdownForCopy('调用 `foo()` 函数')).toBe('调用 foo() 函数');
  });
  it('链接保留文字去 URL', () => {
    expect(stripMarkdownForCopy('见 [文档](https://x.com)')).toBe('见 文档');
  });
  it('图片保留 alt 去 URL', () => {
    expect(stripMarkdownForCopy('![图示](https://x.com/a.png)')).toBe('图示');
  });
  it('去掉无序/有序列表符号', () => {
    expect(stripMarkdownForCopy('- 第一项\n1. 第二项')).toBe('第一项\n第二项');
  });
  it('去掉引用符号', () => {
    expect(stripMarkdownForCopy('> 引用内容')).toBe('引用内容');
  });
  it('收敛多余空行并 trim', () => {
    expect(stripMarkdownForCopy('\n\nA\n\n\n\nB\n\n')).toBe('A\n\nB');
  });

  describe('代码块内容原样保留（与 stripMarkdownForSpeech 的关键差异）', () => {
    it('闭合围栏代码块：只去围栏标记，代码内容不进入语法剥离', () => {
      expect(stripMarkdownForCopy('示例：\n```js\nconst a = 1;\n```\n完成。')).toBe(
        '示例：\nconst a = 1;\n完成。',
      );
    });
    it('代码块内的双下划线方法名不被当作加粗吃掉', () => {
      expect(stripMarkdownForCopy('```py\ndef __init__(self):\n    pass\n```')).toBe(
        'def __init__(self):\n    pass',
      );
    });
    it('代码块内以 # 开头的注释行不被当作标题剥掉', () => {
      expect(stripMarkdownForCopy('```sh\n# important note\necho hi\n```')).toBe(
        '# important note\necho hi',
      );
    });
    it('代码块内模板字符串的反引号不被当作行内代码语法剥掉', () => {
      expect(stripMarkdownForCopy('```js\nconst s = `tpl${1}`;\n```')).toBe('const s = `tpl${1}`;');
    });
    it('未闭合围栏（流式中断）：围栏前正文照常剥离，代码内容原样保留', () => {
      expect(stripMarkdownForCopy('前面文字\n```js\nconst x = 1;\nlet __y = 2')).toBe(
        '前面文字\nconst x = 1;\nlet __y = 2',
      );
    });
    it('多段代码块各自独立剥离围栏，块间正文正常剥离语法', () => {
      expect(stripMarkdownForCopy('前\n```\na__b\n```\n中间*文字*\n```\nc_d\n```\n后')).toBe(
        '前\na__b\n中间文字\nc_d\n后',
      );
    });
  });

  describe('非代码文本里的下划线/星号边界（避免误伤标识符与算式）', () => {
    it('数字中间的下划线不被当作斜体标记（非代码场景）', () => {
      expect(stripMarkdownForCopy('2_3_4 变量名')).toBe('2_3_4 变量名');
    });
    it('snake_case 标识符不被当作斜体标记（非代码场景）', () => {
      expect(stripMarkdownForCopy('const my_var_name = 1;')).toBe('const my_var_name = 1;');
    });
    it('两侧带空格的乘号不被当作强调符号', () => {
      expect(stripMarkdownForCopy('公式: 1 * 2 * 3')).toBe('公式: 1 * 2 * 3');
    });
    it('正常的星号斜体（含单词内部）仍会被剥离', () => {
      expect(stripMarkdownForCopy('foo*bar*baz')).toBe('foobarbaz');
    });
  });
});
