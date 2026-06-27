import path from 'path';
import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig } from '../src/config/types';

/**
 * 回归：loader 对 merge.onLlmRejected / locales / framework.library 等都做了枚举校验，但
 * io.format 与 buckets.layout 直接 `?? 默认值` 透传，非法值（拼写错误等）会静默落入默认分支，
 * 且 io.format 拼错还能绕过「nested 必须 separator='.'」守卫。修复：补齐枚举 fail-fast 校验。
 */
const TEST_ROOT = path.resolve('/tmp/enum-proj');
const base: I18nToolsConfig = {
  root: TEST_ROOT,
  framework: { type: 'vue' },
  llm: { shared: { apiKey: 'sk-test', model: 'gpt-4o' } },
};

describe('resolveConfig — io.format / buckets.layout 枚举校验', () => {
  it('io.format 非法值抛错', () => {
    expect(() => resolveConfig({ ...base, io: { format: 'json' as never } })).toThrow(/io\.format/);
  });

  it('io.format 拼写错误（nestd）抛错而非绕过 nested 守卫', () => {
    expect(() => resolveConfig({ ...base, io: { format: 'nestd' as never } })).toThrow(
      /io\.format/,
    );
  });

  it('合法 io.format 通过', () => {
    expect(() =>
      resolveConfig({ ...base, io: { format: 'flat' }, keys: { separator: '__' } }),
    ).not.toThrow();
    expect(() => resolveConfig({ ...base, io: { format: 'nested' } })).not.toThrow();
  });

  it('buckets.layout 非法值抛错', () => {
    expect(() =>
      resolveConfig({
        ...base,
        buckets: { rules: [{ name: 'a', match: 'src/a/**' }], layout: 'bybucket' as never },
      }),
    ).toThrow(/buckets\.layout/);
  });

  it('合法 buckets.layout 通过', () => {
    expect(() =>
      resolveConfig({
        ...base,
        buckets: { rules: [{ name: 'a', match: 'src/a/**' }], layout: 'by-bucket' },
      }),
    ).not.toThrow();
  });
});
