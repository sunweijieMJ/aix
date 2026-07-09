import MarkdownIt from 'markdown-it';
import { describe, it, expect } from 'vitest';
import { splitMarkdownBlocks } from '../src/utils/splitMarkdownBlocks';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const split = (src: string) => splitMarkdownBlocks(md, src);

describe('splitMarkdownBlocks（顶层块源码切片）', () => {
  it('空串 → 空数组', () => {
    expect(split('')).toEqual([]);
  });

  it('单段落 → 一个块', () => {
    expect(split('hello world')).toEqual(['hello world']);
  });

  it('两个段落 → 两个块（丢弃空行分隔）', () => {
    expect(split('A\n\nB')).toEqual(['A', 'B']);
  });

  it('标题 + 段落 → 两个块', () => {
    expect(split('# 标题\n\n正文')).toEqual(['# 标题', '正文']);
  });

  it('多行围栏代码块作为单个块保留', () => {
    expect(split('```js\nconst a = 1\n```\n\n之后')).toEqual(['```js\nconst a = 1\n```', '之后']);
  });

  it('列表作为单个块（不拆成列表项）', () => {
    expect(split('- a\n- b\n\n段落')).toEqual(['- a\n- b', '段落']);
  });

  it('引用块作为单个块', () => {
    expect(split('> 引用一行\n> 引用二行\n\n正文')).toEqual(['> 引用一行\n> 引用二行', '正文']);
  });

  it('表格作为单个块', () => {
    const table = '| a | b |\n| - | - |\n| 1 | 2 |';
    expect(split(`${table}\n\n说明`)).toEqual([table, '说明']);
  });

  it('流式：末块未完成也被切出（供活跃尾块渲染）', () => {
    expect(split('已完成段落\n\n未完成的段')).toEqual(['已完成段落', '未完成的段']);
  });
});

describe('splitMarkdownBlocks（html:true 时合并相邻 html_block）', () => {
  const mdHtml = new MarkdownIt({ html: true, linkify: true, breaks: true });
  const splitHtml = (src: string) => splitMarkdownBlocks(mdHtml, src);

  it(
    '回归：<!DOCTYPE html> 单独一行会自行收尾（本行含 >），紧邻的 <html>...</html> 另起一个 ' +
      'html_block——未合并时会被裂成两块；合并后整份文档仍是一个块',
    () => {
      const html = '<!DOCTYPE html>\n<html>\n<body>\n<p>hi</p>\n</body>\n</html>';
      expect(splitHtml(html)).toEqual([html]);
    },
  );

  it('回归：文档内部有空行（常见的排版换行）时，未合并会按空行裂成更多块；合并后仍是一个块', () => {
    const html =
      '<!DOCTYPE html>\n<html>\n<head>\n<title>t</title>\n</head>\n\n<body>\n<p>hi</p>\n</body>\n</html>';
    expect(splitHtml(html)).toEqual([html]);
  });

  it('html_block 后紧跟普通 markdown 段落：只合并 html_block 本身，段落仍独立成块', () => {
    const html = '<!DOCTYPE html>\n<html>\n<body>\n<p>hi</p>\n</body>\n</html>';
    expect(splitHtml(`${html}\n\n之后的说明`)).toEqual([html, '之后的说明']);
  });

  it('```html 围栏不受影响：围栏内容原样整体捕获，不会被当成 html_block 拆分', () => {
    const fenced = '```html\n<!DOCTYPE html>\n<html>\n\n<body>hi</body>\n</html>\n```';
    expect(splitHtml(fenced)).toEqual([fenced]);
  });
});
