import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { usePlatform } from '../src/composables/usePlatform';

const mockMatchMedia = (matches: boolean) => {
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  const mql = {
    matches,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return { mql, fire: (m: boolean) => listeners.forEach((fn) => fn({ matches: m })) };
};

afterEach(() => vi.unstubAllGlobals());

describe('usePlatform', () => {
  it('读取 (pointer: coarse) 初值', () => {
    mockMatchMedia(true);
    const scope = effectScope();
    const r = scope.run(() => usePlatform())!;
    expect(r.isCoarsePointer.value).toBe(true);
    scope.stop();
  });

  it('媒体查询变化时响应式更新，scope 销毁时解绑', () => {
    const { mql, fire } = mockMatchMedia(false);
    const scope = effectScope();
    const r = scope.run(() => usePlatform())!;
    expect(r.isCoarsePointer.value).toBe(false);
    fire(true);
    expect(r.isCoarsePointer.value).toBe(true);
    scope.stop();
    expect(mql.removeEventListener).toHaveBeenCalled();
  });
});
