import { describe, it, expect, vi } from 'vitest';

// 移除原生 useId,强制走回退分支;其余 vue 导出透传真实实现
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return { ...actual, useId: undefined };
});

import { useId } from '../src/use-id';

describe('useId(回退分支:Vue < 3.5)', () => {
  it('返回 aix- 前缀的非空字符串', () => {
    const id = useId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^aix-\d+$/);
  });

  it('多次调用返回互不相同的唯一 id', () => {
    const a = useId();
    const b = useId();
    const c = useId();
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
