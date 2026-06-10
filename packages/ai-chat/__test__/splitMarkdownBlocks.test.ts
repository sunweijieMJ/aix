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
