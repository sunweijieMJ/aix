import { describe, expect, it } from 'vitest';
import { hashText } from '../../src/core/hash.js';

describe('hashText', () => {
  it('相同输入应返回相同 hash', () => {
    expect(hashText('共 5 条')).toBe(hashText('共 5 条'));
  });

  it('不同输入应返回不同 hash', () => {
    expect(hashText('共 5 条')).not.toBe(hashText('共 6 条'));
  });

  it('应返回非空字符串', () => {
    expect(hashText('')).toEqual(expect.any(String));
    expect(hashText('').length).toBeGreaterThan(0);
  });
});
