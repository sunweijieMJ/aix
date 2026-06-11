import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transitionHeight } from '../src/utils/heightTransition';

/** jsdom 无布局，offsetHeight 恒 0——用 getter spy 驱动（与 swapTransition 测试同款手法） */
function mockHeight(el: HTMLElement, values: number[]) {
  let i = 0;
  Object.defineProperty(el, 'offsetHeight', {
    configurable: true,
    get: () => values[Math.min(i++, values.length - 1)],
  });
}

describe('transitionHeight（共享 FLIP 高度过渡）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('旧高→新高：先设旧高强制 reflow，再开 transition 过渡到新高', () => {
    const el = document.createElement('div');
    // 读序：nextHeight=120 → reflow 读一次 → 后续随意
    mockHeight(el, [120, 120]);
    const cancel = transitionHeight(el, 60);
    expect(cancel).toBeTypeOf('function');
    expect(el.style.height).toBe('120px');
    expect(el.style.transition).toContain('height');
    expect(el.style.overflow).toBe('hidden');
  });

  it('transitionend 后清理内联样式', () => {
    const el = document.createElement('div');
    mockHeight(el, [120, 120]);
    transitionHeight(el, 60);
    el.dispatchEvent(new Event('transitionend'));
    expect(el.style.height).toBe('');
    expect(el.style.overflow).toBe('');
    expect(el.style.transition).toBe('');
  });

  it('子元素 transitionend 冒泡不提前清理（FLIP 期间子元素 hover 过渡结束不打断高度动画）', () => {
    const el = document.createElement('div');
    const child = document.createElement('button');
    el.appendChild(child);
    mockHeight(el, [120, 120]);
    transitionHeight(el, 60);
    // 子元素过渡结束冒泡到 el（如代码块复制按钮的 transition: all）：不应清理
    child.dispatchEvent(new Event('transitionend', { bubbles: true }));
    expect(el.style.height).toBe('120px');
    expect(el.style.transition).toContain('height');
    // 本元素过渡结束：正常清理
    el.dispatchEvent(new Event('transitionend'));
    expect(el.style.height).toBe('');
  });

  it('transitionend 不触发时 400ms 兜底清理', () => {
    const el = document.createElement('div');
    mockHeight(el, [120, 120]);
    transitionHeight(el, 60);
    vi.advanceTimersByTime(400);
    expect(el.style.height).toBe('');
    expect(el.style.transition).toBe('');
  });

  it('cancel 提前打断：立即清理样式与定时器', () => {
    const el = document.createElement('div');
    mockHeight(el, [120, 120]);
    const cancel = transitionHeight(el, 60)!;
    cancel();
    expect(el.style.height).toBe('');
    // 兜底定时器已清，advance 不应再有副作用
    vi.advanceTimersByTime(400);
    expect(el.style.height).toBe('');
  });

  it('旧高为 0（jsdom/SSR 无布局）或高度差 <2px 时跳过，返回 null', () => {
    const a = document.createElement('div');
    mockHeight(a, [120]);
    expect(transitionHeight(a, 0)).toBeNull();
    const b = document.createElement('div');
    mockHeight(b, [61]);
    expect(transitionHeight(b, 60)).toBeNull();
    expect(b.style.height).toBe('');
    const c = document.createElement('div');
    mockHeight(c, [0]); // 新高不可测
    expect(transitionHeight(c, 60)).toBeNull();
  });
});
