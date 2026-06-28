import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig } from '../src/config/types';

/**
 * 回归（审计 Low）：keys.separator 为空串时必须 fail-fast。
 *
 * 根因（修复前）：`separator: userConfig.keys?.separator ?? DEFAULT` 对 '' 不兜底（'' 非
 * nullish），flat 格式也不校验 separator（nested 才强制 '.'）。空串下 id-generator 用
 * split('')/join('') 拼接 key 段：固定前缀被炸成逐字符，且 ['a','bc'] 与 ['ab','c'] 这类
 * 不同段序列拼成同一 key（碰撞）。
 */
describe('config — keys.separator 空串校验', () => {
  function base(separator: string): I18nToolsConfig {
    return {
      root: '/tmp/x',
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
  }

  it('separator = "" 时抛错', () => {
    expect(() => resolveConfig(base(''))).toThrow(/separator 必须是非空字符串/);
  });

  it('正常 separator（"."）通过', () => {
    expect(() => resolveConfig(base('.'))).not.toThrow();
  });

  it('多字符 separator（"__"）在 flat 下仍合法', () => {
    expect(() => resolveConfig(base('__'))).not.toThrow();
  });
});
