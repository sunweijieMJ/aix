import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  rangeToOffsets,
  offsetsToRange,
  findTextRange,
  getContext,
} from '../src/utils/textRange';

/** 富文本容器：跨内联节点（strong/code）是核心场景 */
const makeContainer = (): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = '快速排序的<strong>平均时间复杂度</strong>是 <code>O(n log n)</code>，最坏情况退化。';
  document.body.appendChild(el);
  return el;
};

describe('normalizeText', () => {
  it('折叠连续空白、去首尾', () => {
    expect(normalizeText('  a\n\n b\tc ')).toBe('a b c');
  });
});

describe('rangeToOffsets / offsetsToRange 互逆（跨内联节点）', () => {
  it('偏移换算跨越 strong 边界', () => {
    const el = makeContainer();
    const full = el.textContent!;
    const target = '平均时间复杂度是';
    const start = full.indexOf(target);
    const range = offsetsToRange(el, start, start + target.length)!;
    expect(range.toString()).toBe(target);
    const back = rangeToOffsets(el, range)!;
    expect(back).toEqual({ start, end: start + target.length });
  });

  it('越界偏移返回 null', () => {
    const el = makeContainer();
    expect(offsetsToRange(el, 0, el.textContent!.length + 10)).toBeNull();
  });
});

describe('findTextRange（回链主路径）', () => {
  it('exact 命中还原 Range', () => {
    const el = makeContainer();
    const r = findTextRange(el, 'O(n log n)');
    expect(r?.toString()).toBe('O(n log n)');
  });

  it('多次命中时用 prefix/suffix 消歧', () => {
    const el = document.createElement('div');
    el.textContent = '甲说好。乙说好。';
    document.body.appendChild(el);
    const r = findTextRange(el, '好', '乙说', '。');
    const off = rangeToOffsets(el, r!)!;
    expect(off.start).toBe(6); // 第二个「好」
  });

  it('未命中返回 null', () => {
    const el = makeContainer();
    expect(findTextRange(el, '不存在的文本')).toBeNull();
  });

  it('空白容差：DOM 原始文本含换行/缩进，归一化后的 exact 仍能命中', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>第一段文字\n    换行后继续</p>';
    document.body.appendChild(el);
    const r = findTextRange(el, '第一段文字 换行后继续');
    expect(r).not.toBeNull();
    // Range 落在原始 DOM 文本上，应还原出未折叠的原始片段
    expect(r!.toString()).toBe('第一段文字\n    换行后继续');
    const off = rangeToOffsets(el, r!)!;
    expect(el.textContent!.slice(off.start, off.end)).toBe('第一段文字\n    换行后继续');
  });

  it('prefix 命中但 suffix 不匹配时，降级为 prefix+exact 消歧', () => {
    const el = document.createElement('div');
    el.textContent = '甲说好。乙说好呀。';
    document.body.appendChild(el);
    // suffix 用错误的内容，不会命中 prefix+exact+suffix，但 prefix+exact 应命中第二个「好」
    const r = findTextRange(el, '好', '乙说', '错误后缀');
    const off = rangeToOffsets(el, r!)!;
    expect(off.start).toBe(6); // 第二个「好」
  });

  it('prefix 不匹配但 suffix 命中时，降级为 exact+suffix 消歧', () => {
    const el = document.createElement('div');
    el.textContent = '甲说好。乙说好呀。';
    document.body.appendChild(el);
    const r = findTextRange(el, '好', '错误前缀', '呀');
    const off = rangeToOffsets(el, r!)!;
    expect(off.start).toBe(6); // 第二个「好」（后面紧跟「呀」）
  });
});

describe('getContext', () => {
  it('截取选中前后 chars 字符', () => {
    const el = document.createElement('div');
    el.textContent = '0123456789ABCDEF';
    document.body.appendChild(el);
    const ctx = getContext(el, 6, 10, 4);
    expect(ctx).toEqual({ prefix: '2345', suffix: 'ABCD' });
  });
});
