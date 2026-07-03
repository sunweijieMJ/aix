import { describe, it, expect } from 'vitest';
import { getCaretRect } from '../src/utils/caretRect';

describe('getCaretRect', () => {
  it('jsdom 下测量结果为零尺寸时返回 null（降级信号）', () => {
    const ta = document.createElement('textarea');
    ta.value = 'hello @wor';
    document.body.appendChild(ta);
    // jsdom 无布局引擎，所有 rect 为 0 → 约定返回 null
    expect(getCaretRect(ta, 6)).toBeNull();
    document.body.removeChild(ta);
  });

  it('不残留镜像节点（成功或失败都清理）', () => {
    const ta = document.createElement('textarea');
    ta.value = '@a';
    document.body.appendChild(ta);
    const before = document.body.childElementCount;
    getCaretRect(ta, 0);
    expect(document.body.childElementCount).toBe(before);
    document.body.removeChild(ta);
  });

  it('异常输入不抛错（index 越界）', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    expect(() => getCaretRect(ta, 999)).not.toThrow();
    document.body.removeChild(ta);
  });
});
