import path from 'path';
import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig } from '../src/config/types';

/**
 * 回归（B14/B15）：
 * - 顶层必填 root/framework 缺失时此前抛 path.resolve(undefined) 之类的晦涩原生错误，
 *   且 root='' 会被 path.resolve('') 静默当成 cwd。修复：补清晰的 fail-fast 守卫。
 * - bucket 的 match/matchKey 此前只校验存在/互斥，不校验类型（prefix rules 已校验），
 *   错误类型会绕过到 BucketResolver 抛「Invalid bucket rule」或运行时 TypeError。修复：补类型校验。
 */
const TEST_ROOT = path.resolve('/tmp/req-proj');
const base: I18nToolsConfig = {
  root: TEST_ROOT,
  framework: { type: 'vue' },
  llm: { shared: { apiKey: 'sk-test', model: 'gpt-4o' } },
};

describe('resolveConfig — 顶层必填字段守卫', () => {
  it('缺失 root 抛清晰错误', () => {
    expect(() =>
      resolveConfig({ framework: { type: 'vue' }, llm: base.llm } as unknown as I18nToolsConfig),
    ).toThrow(/config\.root/);
  });

  it('root 为空字符串抛错（避免被 path.resolve 静默当成 cwd）', () => {
    expect(() => resolveConfig({ ...base, root: '' })).toThrow(/config\.root/);
  });

  it('缺失 framework 抛清晰错误', () => {
    expect(() =>
      resolveConfig({ root: TEST_ROOT, llm: base.llm } as unknown as I18nToolsConfig),
    ).toThrow(/config\.framework/);
  });
});

describe('resolveConfig — bucket match/matchKey 类型校验', () => {
  it('matchKey 非函数抛错', () => {
    expect(() =>
      resolveConfig({
        ...base,
        buckets: { rules: [{ name: 'a', matchKey: 'foo' as never }] },
      }),
    ).toThrow(/matchKey/);
  });

  it('match 非法类型抛错', () => {
    expect(() =>
      resolveConfig({
        ...base,
        buckets: { rules: [{ name: 'a', match: 123 as never }] },
      }),
    ).toThrow(/match/);
  });

  it('合法 match / matchKey 通过', () => {
    expect(() =>
      resolveConfig({ ...base, buckets: { rules: [{ name: 'a', match: 'src/a/**' }] } }),
    ).not.toThrow();
    expect(() =>
      resolveConfig({
        ...base,
        buckets: { rules: [{ name: 'b', matchKey: (k: string) => k.startsWith('b.') }] },
      }),
    ).not.toThrow();
  });
});
