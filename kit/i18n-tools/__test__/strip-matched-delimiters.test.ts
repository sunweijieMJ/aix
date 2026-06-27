import { describe, it, expect } from 'vitest';
import { CommonASTUtils } from '../src/utils/common-ast-utils';

/**
 * 回归（B2）：旧的 `replace(/^['"`]|['"`]$/g, '')` 对首尾各无条件删一个引号字符。
 * 提取出的 original / JSX 文本本身不带定界引号，其内容若以 ASCII 引号收尾
 * （如 `点击"提交"`）会被误删 →
 *   - shouldReplaceNode 两侧归一化后不相等 → 替换被静默跳过（locale 写了源码没改）；
 *   - createMessageWithOptions 写出的 locale 值永久丢字符。
 * 修复：stripMatchedDelimiters 仅在首尾为「同一个定界符」时才剥一层。
 */
describe('CommonASTUtils.stripMatchedDelimiters', () => {
  it('剥成对的同种定界符', () => {
    expect(CommonASTUtils.stripMatchedDelimiters(`'你好'`)).toBe('你好');
    expect(CommonASTUtils.stripMatchedDelimiters(`"你好"`)).toBe('你好');
    expect(CommonASTUtils.stripMatchedDelimiters('`你好`')).toBe('你好');
  });

  it('内容值以 ASCII 引号收尾时不误删（核心修复）', () => {
    expect(CommonASTUtils.stripMatchedDelimiters('点击"提交"')).toBe('点击"提交"');
    expect(CommonASTUtils.stripMatchedDelimiters('"提示"内容')).toBe('"提示"内容');
  });

  it('首尾非同一定界符不剥', () => {
    expect(CommonASTUtils.stripMatchedDelimiters(`'你好"`)).toBe(`'你好"`);
  });

  it('allow 限定只剥反引号：locale 文案路径保留内容里的引号', () => {
    expect(CommonASTUtils.stripMatchedDelimiters('`欢迎${x}`', ['`'])).toBe('欢迎${x}');
    expect(CommonASTUtils.stripMatchedDelimiters('点击"提交"', ['`'])).toBe('点击"提交"');
    expect(CommonASTUtils.stripMatchedDelimiters('"你好"', ['`'])).toBe('"你好"');
  });

  it('长度不足 2 原样返回', () => {
    expect(CommonASTUtils.stripMatchedDelimiters('')).toBe('');
    expect(CommonASTUtils.stripMatchedDelimiters('"')).toBe('"');
  });
});

describe('CommonASTUtils.shouldReplaceNode — 内容含 ASCII 引号', () => {
  it('节点源码带定界引号、original 为去定界内容时仍能匹配（修复前返回 false）', () => {
    expect(CommonASTUtils.shouldReplaceNode(`'点击"提交"'`, '点击"提交"', false)).toBe(true);
    expect(CommonASTUtils.shouldReplaceNode(`'"提示"内容'`, '"提示"内容', false)).toBe(true);
  });

  it('普通中文仍正常匹配', () => {
    expect(CommonASTUtils.shouldReplaceNode(`'点击提交'`, '点击提交', false)).toBe(true);
  });
});

describe('CommonASTUtils.createMessageWithOptions — locale 值不丢内容引号', () => {
  it('内容边界含 ASCII 引号时原样保留（修复前丢字符）', () => {
    expect(CommonASTUtils.createMessageWithOptions('点击"提交"').message).toBe('点击"提交"');
    expect(CommonASTUtils.createMessageWithOptions('"你好"').message).toBe('"你好"');
  });

  it('反引号模板仍剥定界反引号', () => {
    expect(CommonASTUtils.createMessageWithOptions('`你好`').message).toBe('你好');
  });
});
