import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearQuoteHighlights,
  highlightElement,
  highlightRange,
  mergeLineRects,
} from '../src/utils/quoteHighlight';

describe('mergeLineRects', () => {
  it('同一行的多个矩形合并为 1 个联合矩形', () => {
    // 两个矩形垂直重叠远超过较小高度的 50%，视为同一行
    const rects = [new DOMRect(0, 0, 50, 20), new DOMRect(50, 2, 40, 18)] as DOMRect[];
    const merged = mergeLineRects(rects);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ left: 0, top: 0, right: 90, bottom: 20 });
  });

  it('跨行的矩形各自保留', () => {
    const rects = [new DOMRect(0, 0, 50, 20), new DOMRect(0, 25, 60, 20)] as DOMRect[];
    const merged = mergeLineRects(rects);
    expect(merged).toHaveLength(2);
  });

  it('零宽高矩形被过滤', () => {
    const rects = [
      new DOMRect(0, 0, 0, 20),
      new DOMRect(0, 0, 20, 0),
      new DOMRect(0, 0, 30, 20),
    ] as DOMRect[];
    const merged = mergeLineRects(rects);
    expect(merged).toHaveLength(1);
  });

  it('空数组返回空数组', () => {
    expect(mergeLineRects([])).toEqual([]);
  });
});

describe('clearQuoteHighlights', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('移除所有 .aix-quote-highlight 节点', () => {
    document.body.innerHTML =
      '<div class="aix-quote-highlight"></div><div class="aix-quote-highlight"></div>';
    expect(document.querySelectorAll('.aix-quote-highlight')).toHaveLength(2);
    clearQuoteHighlights();
    expect(document.querySelectorAll('.aix-quote-highlight')).toHaveLength(0);
  });
});

describe('highlightElement 重复触发', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('重复触发不叠层，定时器复位后类最终只被移除一次、不残留', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    highlightElement(el, 2000);
    expect(el.classList.contains('aix-quote-highlight-fade')).toBe(true);

    // 1s 后重复触发：应清旧定时器并重播动画
    vi.advanceTimersByTime(1000);
    highlightElement(el, 2000);
    expect(el.classList.contains('aix-quote-highlight-fade')).toBe(true);

    // 若旧定时器未被清理，此刻（首次触发后 1500ms）会误触发移除
    vi.advanceTimersByTime(500);
    expect(el.classList.contains('aix-quote-highlight-fade')).toBe(true);

    // 走完第二次触发的完整时长，类应被移除且不再残留定时器副作用
    vi.runAllTimers();
    expect(el.classList.contains('aix-quote-highlight-fade')).toBe(false);
  });
});

describe('highlightRange 开头先清旧高亮', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('重复调用不会叠加 overlay', () => {
    document.body.innerHTML =
      '<div class="aix-bubble__content" style="position:relative;"><span id="s">文本</span></div>';
    const host = document.querySelector('.aix-bubble__content') as HTMLElement;
    const span = document.getElementById('s')!;

    const fakeRange = {
      startContainer: span,
      getClientRects: () => [new DOMRect(0, 0, 20, 16)],
    } as unknown as Range;

    highlightRange(fakeRange, 2000);
    expect(host.querySelectorAll('.aix-quote-highlight')).toHaveLength(1);

    // 再次触发：旧的应先被清空，不叠加
    highlightRange(fakeRange, 2000);
    expect(host.querySelectorAll('.aix-quote-highlight')).toHaveLength(1);
  });
});
