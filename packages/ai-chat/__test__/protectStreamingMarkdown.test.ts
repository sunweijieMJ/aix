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
});
