import path from 'path';
import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig } from '../src/config/types';

/**
 * 回归：loader 对 io.format / buckets.layout / merge.onLlmRejected 做了枚举白名单校验，但
 * glossary.override / keys.prefix.fileNameCase / indexFile 只有 `?? default` 而从不校验。
 * loader 显式支持 JS 配置（运行时无 TS 类型设防），typo 会静默落入弱默认行为且零诊断
 * （例如 glossary.override='allways' 会静默回退到比默认更弱的 when-empty）。修复：补齐 fail-fast 校验。
 */
const TEST_ROOT = path.resolve('/tmp/enum-extra-proj');
const base: I18nToolsConfig = {
  root: TEST_ROOT,
  framework: { type: 'vue' },
  llm: { shared: { apiKey: 'sk-test', model: 'gpt-4o' } },
};

describe('resolveConfig — glossary.override 枚举校验', () => {
  it('typo（allways）抛错而非静默回退 when-empty', () => {
    expect(() => resolveConfig({ ...base, glossary: { override: 'allways' as never } })).toThrow(
      /glossary\.override/,
    );
  });

  it('合法取值通过', () => {
    expect(() => resolveConfig({ ...base, glossary: { override: 'always' } })).not.toThrow();
    expect(() => resolveConfig({ ...base, glossary: { override: 'when-empty' } })).not.toThrow();
  });

  it('未配置 glossary（用默认 always）通过', () => {
    expect(() => resolveConfig({ ...base })).not.toThrow();
  });
});

describe('resolveConfig — keys.prefix.fileNameCase / indexFile 枚举校验', () => {
  it('fileNameCase 非法字符串抛错', () => {
    expect(() =>
      resolveConfig({
        ...base,
        keys: { prefix: { strategy: 'path', fileNameCase: 'CamelCase' as never } },
      }),
    ).toThrow(/fileNameCase/);
  });

  it('fileNameCase 合法字符串通过', () => {
    for (const c of ['as-is', 'camel', 'kebab', 'snake'] as const) {
      expect(() =>
        resolveConfig({ ...base, keys: { prefix: { strategy: 'path', fileNameCase: c } } }),
      ).not.toThrow();
    }
  });

  it('fileNameCase 传函数（自定义转换）不被误拦', () => {
    expect(() =>
      resolveConfig({
        ...base,
        keys: { prefix: { strategy: 'path', fileNameCase: (n: string) => n.toUpperCase() } },
      }),
    ).not.toThrow();
  });

  it('indexFile 非法值抛错', () => {
    expect(() =>
      resolveConfig({
        ...base,
        keys: { prefix: { strategy: 'path', indexFile: 'collapse' as never } },
      }),
    ).toThrow(/indexFile/);
  });

  it('indexFile 合法值通过', () => {
    for (const v of ['as-is', 'collapse-to-parent'] as const) {
      expect(() =>
        resolveConfig({ ...base, keys: { prefix: { strategy: 'path', indexFile: v } } }),
      ).not.toThrow();
    }
  });
});
