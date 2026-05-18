import { describe, expect, it, vi } from 'vitest';
import { resolveBuckets, resolveConfig } from '../src/config/loader';
import { BUILTIN_CN_MAPPINGS } from '../src/config/defaults';
import type { I18nToolsConfig } from '../src/config/types';

// 最小可用 LLM 配置（多数测试不关心 LLM）
const llm = {
  shared: { apiKey: 'sk-test', model: 'gpt-4o' },
} as const;

const baseConfig: I18nToolsConfig = {
  root: '/tmp/proj',
  framework: { type: 'vue' },
  llm,
};

describe('resolveConfig - 默认值', () => {
  it('填充全部默认值', () => {
    const r = resolveConfig(baseConfig);
    expect(r.root).toBe('/tmp/proj');
    expect(r.framework.type).toBe('vue');
    expect(r.framework.library).toBe('vue-i18n');
    expect(r.framework.tImport).toBe('@/i18n');
    expect(r.locales.source).toBe('zh-CN');
    expect(r.locales.targets).toEqual(['en-US']);
    expect(r.io.localesDir).toBe('/tmp/proj/src/i18n');
    expect(r.io.sourceDir).toBe('/tmp/proj/src');
    expect(r.io.format).toBe('nested');
    expect(r.io.prettify).toBe(true);
    expect(r.io.indent).toBe(2);
    expect(r.keys.separator).toBe('.');
    expect(r.keys.prefix.strategy).toBe('path');
    expect(r.keys.fallback.extend).toBe(true);
    expect(r.keys.reuse.acrossDirectories).toBe(false);
    expect(r.merge.onLlmRejected).toBe('fallback-to-source');
  });

  it('extend=true 时合并内置中文映射', () => {
    const r = resolveConfig({
      ...baseConfig,
      keys: { fallback: { extend: true, mappings: { 新增: 'newOne' } } },
    });
    expect(r.keys.fallback.mappings).toMatchObject(BUILTIN_CN_MAPPINGS);
    expect(r.keys.fallback.mappings['新增']).toBe('newOne');
  });

  it('extend=false 时只用用户配置', () => {
    const r = resolveConfig({
      ...baseConfig,
      keys: { fallback: { extend: false, mappings: { 仅有: 'onlyOne' } } },
    });
    expect(r.keys.fallback.mappings).toEqual({ 仅有: 'onlyOne' });
    expect(r.keys.fallback.mappings['确认']).toBeUndefined();
  });

  it('exportDir / customDir 未配置时保持 undefined', () => {
    const r = resolveConfig(baseConfig);
    expect(r.io.exportDir).toBeUndefined();
    expect(r.io.customDir).toBeUndefined();
  });

  it('glossary.file 未配置时保持 undefined', () => {
    const r = resolveConfig(baseConfig);
    expect(r.glossary.file).toBeUndefined();
    expect(r.glossary.override).toBe('always');
  });

  it('指定 io.exportDir 时解析为绝对路径', () => {
    const r = resolveConfig({
      ...baseConfig,
      io: { exportDir: 'dist/locales' },
    });
    expect(r.io.exportDir).toBe('/tmp/proj/dist/locales');
  });
});

describe('resolveConfig - framework 联合校验', () => {
  it('vue + vue-i18n 合法', () => {
    const r = resolveConfig({ ...baseConfig, framework: { type: 'vue', library: 'vue-i18n' } });
    expect(r.framework.library).toBe('vue-i18n');
  });

  it('vue + react-intl 抛错', () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        framework: { type: 'vue', library: 'react-intl' as any },
      }),
    ).toThrow(/与 type='vue' 不匹配/);
  });

  it('react + react-intl 合法且支持 includeDefaultMessage', () => {
    const r = resolveConfig({
      ...baseConfig,
      framework: { type: 'react', library: 'react-intl', includeDefaultMessage: true },
    });
    expect(r.framework.library).toBe('react-intl');
    expect(r.framework.includeDefaultMessage).toBe(true);
  });

  it('react + vue-i18n 抛错', () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        framework: { type: 'react', library: 'vue-i18n' as any },
      }),
    ).toThrow(/与 type='react' 不匹配/);
  });
});

describe('resolveConfig - keys.prefix 策略', () => {
  it("strategy='path' 时填充 anchor/skip/take 默认", () => {
    const r = resolveConfig({
      ...baseConfig,
      keys: { prefix: { strategy: 'path' } },
    });
    const p = r.keys.prefix;
    expect(p.strategy).toBe('path');
    if (p.strategy === 'path') {
      expect(p.anchor).toBe('src');
      expect(p.skip).toBe(0);
      expect(p.take).toBe(0);
      expect(p.includeFile).toBe(false);
    }
  });

  it("strategy='fixed' 时必须有 value", () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        keys: { prefix: { strategy: 'fixed' } as any },
      }),
    ).toThrow(/必须提供非空的 value/);
  });

  it("strategy='fixed' 透传 value", () => {
    const r = resolveConfig({
      ...baseConfig,
      keys: { prefix: { strategy: 'fixed', value: 'common' } },
    });
    expect(r.keys.prefix.strategy).toBe('fixed');
    if (r.keys.prefix.strategy === 'fixed') {
      expect(r.keys.prefix.value).toBe('common');
    }
  });

  it("strategy='custom' 时必须有 resolve", () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        keys: { prefix: { strategy: 'custom' } as any },
      }),
    ).toThrow(/必须提供 resolve 函数/);
  });

  it("strategy='custom' 透传 resolve", () => {
    const fn = () => ['x'];
    const r = resolveConfig({
      ...baseConfig,
      keys: { prefix: { strategy: 'custom', resolve: fn } },
    });
    expect(r.keys.prefix.strategy).toBe('custom');
    if (r.keys.prefix.strategy === 'custom') {
      expect(r.keys.prefix.resolve).toBe(fn);
    }
  });

  it("path 策略默认 preserveHyphens=true / indexFile='collapse-to-parent'", () => {
    const r = resolveConfig({
      ...baseConfig,
      keys: { prefix: { strategy: 'path' } },
    });
    if (r.keys.prefix.strategy === 'path') {
      expect(r.keys.prefix.preserveHyphens).toBe(true);
      expect(r.keys.prefix.indexFile).toBe('collapse-to-parent');
    }
  });

  it("strategy='rules' 时递归填充 use 与 fallback 的默认值", () => {
    const r = resolveConfig({
      ...baseConfig,
      keys: {
        prefix: {
          strategy: 'rules',
          rules: [
            { match: 'src/pages/**', use: { strategy: 'path', take: 3 } },
            { match: 'src/utils/**', use: { strategy: 'fixed', value: 'utils' } },
          ],
          fallback: { strategy: 'path' },
        },
      },
    });
    expect(r.keys.prefix.strategy).toBe('rules');
    if (r.keys.prefix.strategy === 'rules') {
      expect(r.keys.prefix.rules).toHaveLength(2);
      const first = r.keys.prefix.rules[0]!.use;
      expect(first.strategy).toBe('path');
      if (first.strategy === 'path') {
        expect(first.anchor).toBe('src'); // 填充默认
        expect(first.take).toBe(3);
        expect(first.preserveHyphens).toBe(true);
      }
      const second = r.keys.prefix.rules[1]!.use;
      expect(second.strategy).toBe('fixed');
      expect(r.keys.prefix.fallback?.strategy).toBe('path');
    }
  });

  it("strategy='rules' 空 rules 抛错", () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        keys: { prefix: { strategy: 'rules', rules: [] } },
      }),
    ).toThrow(/rules 必须是非空数组/);
  });

  it("strategy='rules' 禁止嵌套 rules", () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        keys: {
          prefix: {
            strategy: 'rules',
            rules: [
              {
                match: 'src/**',
                use: { strategy: 'rules', rules: [] } as any,
              },
            ],
          },
        },
      }),
    ).toThrow(/不允许嵌套 strategy='rules'/);
  });

  it("strategy='rules' rule.match 类型非法抛错", () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        keys: {
          prefix: {
            strategy: 'rules',
            rules: [{ match: 123 as any, use: { strategy: 'path' } }],
          },
        },
      }),
    ).toThrow(/match 必须是/);
  });

  it("strategy='rules' fallback 可省略", () => {
    const r = resolveConfig({
      ...baseConfig,
      keys: {
        prefix: {
          strategy: 'rules',
          rules: [{ match: 'src/**', use: { strategy: 'fixed', value: 'x' } }],
        },
      },
    });
    if (r.keys.prefix.strategy === 'rules') {
      expect(r.keys.prefix.fallback).toBeUndefined();
    }
  });
});

describe('resolveConfig - separator 与 nested 交叉校验', () => {
  it('nested + separator="." 合法', () => {
    expect(() =>
      resolveConfig({ ...baseConfig, io: { format: 'nested' }, keys: { separator: '.' } }),
    ).not.toThrow();
  });

  it("nested + separator='__' 抛错", () => {
    expect(() =>
      resolveConfig({ ...baseConfig, io: { format: 'nested' }, keys: { separator: '__' } }),
    ).toThrow(/io.format='nested' 要求 keys.separator/);
  });

  it("flat + separator='__' 合法", () => {
    expect(() =>
      resolveConfig({ ...baseConfig, io: { format: 'flat' }, keys: { separator: '__' } }),
    ).not.toThrow();
  });
});

describe('resolveConfig - locales 校验', () => {
  it('source 与 target 同语种抛错', () => {
    expect(() =>
      resolveConfig({ ...baseConfig, locales: { source: 'zh', targets: ['zh', 'en'] } }),
    ).toThrow(/targets 不能包含 source/);
  });

  it('targets 重复抛错', () => {
    expect(() =>
      resolveConfig({ ...baseConfig, locales: { source: 'zh', targets: ['en', 'en', 'ja'] } }),
    ).toThrow(/存在重复语种/);
  });

  it('多 target 透传', () => {
    const r = resolveConfig({
      ...baseConfig,
      locales: { source: 'zh', targets: ['en', 'ja', 'ko'] },
    });
    expect(r.locales.targets).toEqual(['en', 'ja', 'ko']);
  });

  it('names 合并', () => {
    const r = resolveConfig({
      ...baseConfig,
      locales: { names: { 'zh-HK': 'Hong Kong Chinese' } },
    });
    expect(r.locales.names['zh-HK']).toBe('Hong Kong Chinese');
  });
});

describe('resolveConfig - ci.coverageThreshold', () => {
  it('未配置时为 undefined', () => {
    const r = resolveConfig(baseConfig);
    expect(r.ci.coverageThreshold).toBeUndefined();
  });

  it('合法范围 [0, 100]', () => {
    const r = resolveConfig({ ...baseConfig, ci: { coverageThreshold: 95 } });
    expect(r.ci.coverageThreshold).toBe(95);
  });

  it('< 0 抛错', () => {
    expect(() => resolveConfig({ ...baseConfig, ci: { coverageThreshold: -1 } })).toThrow(
      /\[0, 100\]/,
    );
  });

  it('> 100 抛错', () => {
    expect(() => resolveConfig({ ...baseConfig, ci: { coverageThreshold: 101 } })).toThrow(
      /\[0, 100\]/,
    );
  });

  it('非数字抛错', () => {
    expect(() =>
      resolveConfig({ ...baseConfig, ci: { coverageThreshold: 'high' as any } }),
    ).toThrow(/\[0, 100\]/);
  });
});

describe('resolveConfig - LLM 合并', () => {
  it('apiKey 缺失抛错', () => {
    expect(() =>
      resolveConfig({
        root: '/tmp/proj',
        framework: { type: 'vue' },
        llm: { shared: { model: 'gpt-4o' } },
      }),
    ).toThrow(/apiKey 未配置/);
  });

  it('shared 字段被任务级继承', () => {
    const r = resolveConfig({
      root: '/tmp/proj',
      framework: { type: 'vue' },
      llm: {
        shared: { apiKey: 'k1', model: 'gpt-4o', baseURL: 'https://api.x' },
        idGeneration: { concurrency: 3 },
        translation: { batchSize: 50 },
      },
    });
    expect(r.llm.idGeneration.apiKey).toBe('k1');
    expect(r.llm.idGeneration.baseURL).toBe('https://api.x');
    expect(r.llm.idGeneration.concurrency).toBe(3);
    expect(r.llm.translation.apiKey).toBe('k1');
    expect(r.llm.translation.batchSize).toBe(50);
  });

  it('任务级字段覆盖 shared', () => {
    const r = resolveConfig({
      root: '/tmp/proj',
      framework: { type: 'vue' },
      llm: {
        shared: { apiKey: 'k1', model: 'gpt-4o' },
        idGeneration: { model: 'gpt-3.5-turbo' },
      },
    });
    expect(r.llm.idGeneration.model).toBe('gpt-3.5-turbo');
    expect(r.llm.translation.model).toBe('gpt-4o');
  });

  it('默认值填充', () => {
    const r = resolveConfig(baseConfig);
    expect(r.llm.idGeneration.concurrency).toBe(5);
    expect(r.llm.idGeneration.batchSize).toBe(30);
    expect(r.llm.idGeneration.throttleMs).toBe(500);
    expect(r.llm.idGeneration.temperature).toBe(0.1);
  });
});

describe('resolveConfig - merge.onLlmRejected 枚举', () => {
  it("默认 'fallback-to-source'", () => {
    expect(resolveConfig(baseConfig).merge.onLlmRejected).toBe('fallback-to-source');
  });

  it("'warn-only' 合法", () => {
    expect(
      resolveConfig({ ...baseConfig, merge: { onLlmRejected: 'warn-only' } }).merge.onLlmRejected,
    ).toBe('warn-only');
  });

  it('未知值抛错', () => {
    expect(() =>
      resolveConfig({ ...baseConfig, merge: { onLlmRejected: 'whatever' as any } }),
    ).toThrow(/merge.onLlmRejected/);
  });
});

describe('resolveBuckets', () => {
  it('未配置时返回 undefined', () => {
    expect(resolveBuckets(undefined)).toBeUndefined();
  });

  it('空 rules 抛错', () => {
    expect(() => resolveBuckets({ rules: [] })).toThrow('rules 必须是非空数组');
  });

  it('重复 name 抛错', () => {
    expect(() =>
      resolveBuckets({
        rules: [
          { name: 'a', match: '**/*' },
          { name: 'a', match: '**/*' },
        ],
      }),
    ).toThrow(/重复的 name.*"a"/);
  });

  it('match 与 matchKey 同时存在抛错', () => {
    expect(() =>
      resolveBuckets({
        rules: [{ name: 'a', match: '**/*', matchKey: () => true }],
      }),
    ).toThrow(/规则 "a".*不能同时配置/);
  });

  it('既无 match 也无 matchKey 抛错', () => {
    expect(() => resolveBuckets({ rules: [{ name: 'a' } as any] })).toThrow(
      /规则 "a".*必须提供 match 或 matchKey/,
    );
  });

  it('defaultBucket 与 rule.name 重名抛错', () => {
    expect(() =>
      resolveBuckets({
        rules: [{ name: 'common', match: '**/*' }],
        defaultBucket: 'common',
      }),
    ).toThrow(/defaultBucket "common" 与同名 rule 冲突/);
  });

  it('填充默认值', () => {
    const result = resolveBuckets({
      rules: [{ name: 'order', match: 'src/views/order/**' }],
    });
    expect(result?.defaultBucket).toBe('common');
    expect(result?.emitManifest).toBe(true);
    expect(result?.layout).toBe('by-locale');
  });
});

describe('resolveConfig - buckets + fixed prefix 警告', () => {
  it('fixed prefix + glob match 时打 warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveConfig({
      ...baseConfig,
      io: { format: 'flat' }, // 避免与 separator 校验冲突
      keys: { prefix: { strategy: 'fixed', value: 'common' } },
      buckets: { rules: [{ name: 'order', match: 'src/views/order/**' }] },
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/fixed.*与 buckets/));
    warnSpy.mockRestore();
  });

  it('fixed prefix + matchKey 不警告', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveConfig({
      ...baseConfig,
      io: { format: 'flat' },
      keys: { prefix: { strategy: 'fixed', value: 'common' } },
      buckets: { rules: [{ name: 'order', matchKey: (k) => k.startsWith('order') }] },
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rules prefix + glob match 同样警告', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveConfig({
      ...baseConfig,
      io: { format: 'flat' },
      keys: {
        prefix: {
          strategy: 'rules',
          rules: [{ match: 'src/pages/**', use: { strategy: 'path' } }],
        },
      },
      buckets: { rules: [{ name: 'order', match: 'src/views/order/**' }] },
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/'rules'.*与 buckets/));
    warnSpy.mockRestore();
  });
});
