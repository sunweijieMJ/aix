import { describe, it, expect, vi } from 'vitest';

// 把原生 useId 替换为可观测的 spy，验证 Vue 3.5+ 下我们的封装直接透传原生实现;
// 其余 vue 导出透传真实实现。与 use-id.test.ts(回退分支)互补。
// vi.mock 工厂会被 hoist 到文件顶部,故用 vi.hoisted 让 spy 一同提升,避免引用未初始化变量
const { nativeUseId } = vi.hoisted(() => ({ nativeUseId: vi.fn(() => 'v-42') }));
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return { ...actual, useId: nativeUseId };
});

import { useId } from '../src/use-id';

describe('useId(原生透传:Vue >= 3.5)', () => {
  it('存在原生 useId 时直接透传其返回值', () => {
    expect(useId()).toBe('v-42');
    expect(nativeUseId).toHaveBeenCalledTimes(1);
  });
});
