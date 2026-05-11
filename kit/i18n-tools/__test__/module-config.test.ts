import { describe, it, expect } from 'vitest';
import { resolveModules } from '../src/config/loader';

describe('resolveModules', () => {
  it('未配置时返回 undefined', () => {
    expect(resolveModules(undefined)).toBeUndefined();
  });

  it('空 rules 抛错', () => {
    expect(() => resolveModules({ rules: [] })).toThrow('rules 必须是非空数组');
  });

  it('重复 name 抛错', () => {
    expect(() =>
      resolveModules({
        rules: [
          { name: 'a', match: '**/*' },
          { name: 'a', match: '**/*' },
        ],
      }),
    ).toThrow(/重复的 name.*"a"/);
  });

  it('match 与 matchKey 同时存在抛错', () => {
    expect(() =>
      resolveModules({
        rules: [{ name: 'a', match: '**/*', matchKey: () => true }],
      }),
    ).toThrow(/规则 "a".*不能同时配置/);
  });

  it('既无 match 也无 matchKey 抛错', () => {
    expect(() => resolveModules({ rules: [{ name: 'a' } as any] })).toThrow(
      /规则 "a".*必须提供 match 或 matchKey/,
    );
  });

  it('填充默认值', () => {
    const result = resolveModules({
      rules: [{ name: 'order', match: 'src/views/order/**' }],
    });
    expect(result).toEqual({
      rules: [{ name: 'order', match: 'src/views/order/**' }],
      defaultModule: 'common',
      manifest: true,
      layout: 'by-locale',
    });
  });
});
