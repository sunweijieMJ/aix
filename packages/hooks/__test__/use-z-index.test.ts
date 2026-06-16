import { describe, it, expect } from 'vitest';
import { useZIndex } from '../src/use-z-index';

describe('useZIndex', () => {
  it('nextZIndex should return an incrementing value', () => {
    const { nextZIndex } = useZIndex();
    const first = nextZIndex();
    const second = nextZIndex();
    expect(second).toBe(first + 1);
  });

  it('currentZIndex should reflect the latest nextZIndex result', () => {
    const { currentZIndex, nextZIndex } = useZIndex();
    const value = nextZIndex();
    expect(currentZIndex.value).toBe(value);
  });

  it('should share a single global counter across separate calls (singleton)', () => {
    const a = useZIndex();
    const b = useZIndex();
    const fromA = a.nextZIndex();
    const fromB = b.nextZIndex();
    // 两个独立实例共享同一个模块级计数器，b 必然比 a 大
    expect(fromB).toBe(fromA + 1);
  });

  it('base value should be higher than theme semantic layers (>= 2000)', () => {
    const { nextZIndex } = useZIndex();
    expect(nextZIndex()).toBeGreaterThan(2000);
  });
});
