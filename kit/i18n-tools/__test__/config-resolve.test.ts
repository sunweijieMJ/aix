import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfigFile, resolveBuckets, resolveConfig } from '../src/config/loader';
import {
  BUILTIN_CN_MAPPINGS,
  DEFAULT_IO,
  DEFAULT_KEYS,
  DEFAULT_EXTRACT,
} from '../src/config/defaults';
import type { I18nToolsConfig } from '../src/config/types';

// 最小可用 LLM 配置（多数测试不关心 LLM）
const llm = {
  shared: { apiKey: 'sk-test', model: 'gpt-4o' },
} as const;

// 跨平台测试根路径：loader 内部用 path.resolve 把它归一化为平台原生绝对路径，
// 期望值也用 path.resolve 算，避免硬编码 POSIX 在 Windows 上 mismatch。
const TEST_ROOT = path.resolve('/tmp/proj');
const expectInRoot = (...segs: string[]): string => path.resolve(TEST_ROOT, ...segs);

const baseConfig: I18nToolsConfig = {
  root: TEST_ROOT,
  framework: { type: 'vue' },
  llm,
};

describe('resolveConfig - 默认值', () => {
  it('填充全部默认值', () => {
    const r = resolveConfig(baseConfig);
    expect(r.root).toBe(TEST_ROOT);
    expect(r.framework.type).toBe('vue');
    expect(r.framework.library).toBe('vue-i18n');
    expect(r.framework.tImport).toBe('@/i18n');
    expect(r.locales.source).toBe('zh-CN');
    expect(r.locales.targets).toEqual(['en-US']);
    expect(r.io.localesDir).toBe(expectInRoot('src/i18n'));
    expect(r.io.sourceDir).toBe(expectInRoot('src'));
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
    expect(r.io.exportDir).toBe(expectInRoot('dist/locales'));
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

  it('显式空 targets 数组抛错（区别于未配置回落默认）', () => {
    // 回归：`targets: []` 旧实现被当作未配置、悄悄塞回 ['en-US']；
    // 当 source 恰为默认目标时还会抛出引用未配置语种的误导性错误。
    expect(() => resolveConfig({ ...baseConfig, locales: { targets: [] } })).toThrow(
      /targets 不能为空数组/,
    );
    // 关键：错误信息不得提及用户从未配置的 'en-US'
    expect(() =>
      resolveConfig({ ...baseConfig, locales: { source: 'en-US', targets: [] } }),
    ).toThrow(/targets 不能为空数组/);
  });

  it('未配置 targets → 仍回落默认（修复不影响默认路径）', () => {
    const r = resolveConfig({ ...baseConfig, locales: { source: 'zh-CN' } });
    expect(r.locales.targets).toEqual(['en-US']);
  });

  it('targets 误写字符串（JS 配置漏数组括号）抛错，不被逐字符展开', () => {
    // 回归：`targets: 'en-US'` 旧实现 length===5 通过空数组守卫，[...'en-US'] 展开成
    // ['e','n','-','U','S'] 五个伪语种，逐项非空 / source / 去重守卫全部放行 → 静默生成错误产物。
    expect(() =>
      // 故意传入非数组类型，绕过 TS 校验模拟 JS 配置文件
      resolveConfig({ ...baseConfig, locales: { targets: 'en-US' as unknown as string[] } }),
    ).toThrow(/targets 必须是.*数组/);
  });

  it('io.include / io.exclude 误写字符串抛错，不被逐字符展开', () => {
    expect(() =>
      resolveConfig({ ...baseConfig, io: { include: 'src/**' as unknown as string[] } }),
    ).toThrow(/io\.include 必须是.*数组/);
    expect(() =>
      resolveConfig({ ...baseConfig, io: { exclude: 'dist/**' as unknown as string[] } }),
    ).toThrow(/io\.exclude 必须是.*数组/);
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
  it('apiKey 缺失不抛错（lazy 校验：留待真正调用 LLM 时由 LLMClient 拦截）', () => {
    const r = resolveConfig({
      root: '/tmp/proj',
      framework: { type: 'vue' },
      llm: { shared: { model: 'gpt-4o' } },
    });
    expect(r.llm.idGeneration.apiKey).toBe('');
    expect(r.llm.translation.apiKey).toBe('');
    expect(r.llm.idGeneration.model).toBe('gpt-4o');
  });

  it('完全不配 llm 时使用全默认占位，不抛错', () => {
    const r = resolveConfig({
      root: '/tmp/proj',
      framework: { type: 'vue' },
    });
    expect(r.llm.idGeneration.apiKey).toBe('');
    expect(r.llm.translation.apiKey).toBe('');
    // 默认 model 仍被填充，便于 doctor / 日志展示
    expect(r.llm.idGeneration.model).toBeTruthy();
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

  it('headers 深合并：shared 与任务级可加，不被整体覆盖（Bug #6）', () => {
    const r = resolveConfig({
      root: '/tmp/proj',
      framework: { type: 'vue' },
      llm: {
        shared: { apiKey: 'k1', model: 'gpt-4o', headers: { Authorization: 'Bearer GLOBAL' } },
        translation: { headers: { 'X-Trace': 'task-123' } },
      },
    });
    // translation 同时含 shared 的鉴权头与任务级追踪头（不再丢失 Authorization）
    expect(r.llm.translation.headers).toEqual({
      Authorization: 'Bearer GLOBAL',
      'X-Trace': 'task-123',
    });
    // idGeneration 未配任务级 headers：继承 shared
    expect(r.llm.idGeneration.headers).toEqual({ Authorization: 'Bearer GLOBAL' });
  });

  it('任务级 headers 同名键覆盖 shared 同名键（覆盖语义仍保留）', () => {
    const r = resolveConfig({
      root: '/tmp/proj',
      framework: { type: 'vue' },
      llm: {
        shared: { apiKey: 'k1', model: 'gpt-4o', headers: { 'X-Env': 'prod', Authorization: 'A' } },
        translation: { headers: { 'X-Env': 'test' } },
      },
    });
    expect(r.llm.translation.headers).toEqual({ 'X-Env': 'test', Authorization: 'A' });
  });

  it('均未配 headers：为 undefined（不产出空对象）', () => {
    const r = resolveConfig({
      root: '/tmp/proj',
      framework: { type: 'vue' },
      llm: { shared: { apiKey: 'k1', model: 'gpt-4o' } },
    });
    expect(r.llm.translation.headers).toBeUndefined();
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

describe('resolveConfig - 数组默认值防御性拷贝（不共享引用）', () => {
  it('未配置时 io.include/exclude 不与 DEFAULT_IO 共享引用，mutate 不污染默认值', () => {
    const beforeInclude = DEFAULT_IO.include.length;
    const beforeExclude = DEFAULT_IO.exclude.length;
    const r = resolveConfig(baseConfig);

    expect(r.io.include).not.toBe(DEFAULT_IO.include);
    expect(r.io.exclude).not.toBe(DEFAULT_IO.exclude);
    expect(r.io.include).toEqual(DEFAULT_IO.include);

    // 下游 mutate 解析结果不应回灌默认值
    r.io.include.push('**/*.svelte');
    r.io.exclude.push('**/garbage/**');
    expect(DEFAULT_IO.include).toHaveLength(beforeInclude);
    expect(DEFAULT_IO.exclude).toHaveLength(beforeExclude);
  });

  it('未配置时 keys.dynamicKeyAllowlist 与 extract.filterPatterns 不与 DEFAULT 共享引用', () => {
    const r = resolveConfig(baseConfig);
    expect(r.keys.dynamicKeyAllowlist).not.toBe(DEFAULT_KEYS.dynamicKeyAllowlist);
    expect(r.extract.filterPatterns).not.toBe(DEFAULT_EXTRACT.filterPatterns);

    r.keys.dynamicKeyAllowlist.push('foo.*');
    r.extract.filterPatterns.push(/bar/);
    expect(DEFAULT_KEYS.dynamicKeyAllowlist).toHaveLength(0);
    expect(DEFAULT_EXTRACT.filterPatterns).toHaveLength(0);
  });

  it('两次 resolveConfig 产出的同名数组互相独立', () => {
    const a = resolveConfig(baseConfig);
    const b = resolveConfig(baseConfig);
    expect(a.io.include).not.toBe(b.io.include);
    a.io.include.push('only-in-a');
    expect(b.io.include).not.toContain('only-in-a');
  });
});

/**
 * 回归：loader 对 merge.onLlmRejected / locales / framework.library 等都做了枚举校验，但
 * io.format 与 buckets.layout 直接 `?? 默认值` 透传，非法值（拼写错误等）会静默落入默认分支，
 * 且 io.format 拼错还能绕过「nested 必须 separator='.'」守卫。修复：补齐枚举 fail-fast 校验。
 */
describe('resolveConfig — io.format / buckets.layout 枚举校验', () => {
  it('io.format 非法值抛错', () => {
    expect(() => resolveConfig({ ...baseConfig, io: { format: 'json' as never } })).toThrow(
      /io\.format/,
    );
  });

  it('io.format 拼写错误（nestd）抛错而非绕过 nested 守卫', () => {
    expect(() => resolveConfig({ ...baseConfig, io: { format: 'nestd' as never } })).toThrow(
      /io\.format/,
    );
  });

  it('合法 io.format 通过', () => {
    expect(() =>
      resolveConfig({ ...baseConfig, io: { format: 'flat' }, keys: { separator: '__' } }),
    ).not.toThrow();
    expect(() => resolveConfig({ ...baseConfig, io: { format: 'nested' } })).not.toThrow();
  });

  it('buckets.layout 非法值抛错', () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        buckets: { rules: [{ name: 'a', match: 'src/a/**' }], layout: 'bybucket' as never },
      }),
    ).toThrow(/buckets\.layout/);
  });

  it('合法 buckets.layout 通过', () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        buckets: { rules: [{ name: 'a', match: 'src/a/**' }], layout: 'by-bucket' },
      }),
    ).not.toThrow();
  });
});

/**
 * 回归：loader 对 io.format / buckets.layout / merge.onLlmRejected 做了枚举白名单校验，但
 * glossary.override / keys.prefix.fileNameCase / indexFile 只有 `?? default` 而从不校验。
 * loader 显式支持 JS 配置（运行时无 TS 类型设防），typo 会静默落入弱默认行为且零诊断
 * （例如 glossary.override='allways' 会静默回退到比默认更弱的 when-empty）。修复：补齐 fail-fast 校验。
 */
describe('resolveConfig — glossary.override 枚举校验', () => {
  it('typo（allways）抛错而非静默回退 when-empty', () => {
    expect(() =>
      resolveConfig({ ...baseConfig, glossary: { override: 'allways' as never } }),
    ).toThrow(/glossary\.override/);
  });

  it('合法取值通过', () => {
    expect(() => resolveConfig({ ...baseConfig, glossary: { override: 'always' } })).not.toThrow();
    expect(() =>
      resolveConfig({ ...baseConfig, glossary: { override: 'when-empty' } }),
    ).not.toThrow();
  });

  it('未配置 glossary（用默认 always）通过', () => {
    expect(() => resolveConfig({ ...baseConfig })).not.toThrow();
  });
});

describe('resolveConfig — keys.prefix.fileNameCase / indexFile 枚举校验', () => {
  it('fileNameCase 非法字符串抛错', () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        keys: { prefix: { strategy: 'path', fileNameCase: 'CamelCase' as never } },
      }),
    ).toThrow(/fileNameCase/);
  });

  it('fileNameCase 合法字符串通过', () => {
    for (const c of ['as-is', 'camel', 'kebab', 'snake'] as const) {
      expect(() =>
        resolveConfig({ ...baseConfig, keys: { prefix: { strategy: 'path', fileNameCase: c } } }),
      ).not.toThrow();
    }
  });

  it('fileNameCase 传函数（自定义转换）不被误拦', () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        keys: { prefix: { strategy: 'path', fileNameCase: (n: string) => n.toUpperCase() } },
      }),
    ).not.toThrow();
  });

  it('indexFile 非法值抛错', () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        keys: { prefix: { strategy: 'path', indexFile: 'collapse' as never } },
      }),
    ).toThrow(/indexFile/);
  });

  it('indexFile 合法值通过', () => {
    for (const v of ['as-is', 'collapse-to-parent'] as const) {
      expect(() =>
        resolveConfig({ ...baseConfig, keys: { prefix: { strategy: 'path', indexFile: v } } }),
      ).not.toThrow();
    }
  });
});

/**
 * 回归（B14/B15）：
 * - 顶层必填 root/framework 缺失时此前抛 path.resolve(undefined) 之类的晦涩原生错误，
 *   且 root='' 会被 path.resolve('') 静默当成 cwd。修复：补清晰的 fail-fast 守卫。
 * - bucket 的 match/matchKey 此前只校验存在/互斥，不校验类型（prefix rules 已校验），
 *   错误类型会绕过到 BucketResolver 抛「Invalid bucket rule」或运行时 TypeError。修复：补类型校验。
 */
describe('resolveConfig — 顶层必填字段守卫', () => {
  it('缺失 root 抛清晰错误', () => {
    expect(() =>
      resolveConfig({ framework: { type: 'vue' }, llm } as unknown as I18nToolsConfig),
    ).toThrow(/config\.root/);
  });

  it('root 为空字符串抛错（避免被 path.resolve 静默当成 cwd）', () => {
    expect(() => resolveConfig({ ...baseConfig, root: '' })).toThrow(/config\.root/);
  });

  it('缺失 framework 抛清晰错误', () => {
    expect(() => resolveConfig({ root: TEST_ROOT, llm } as unknown as I18nToolsConfig)).toThrow(
      /config\.framework/,
    );
  });
});

describe('resolveConfig — bucket match/matchKey 类型校验', () => {
  it('matchKey 非函数抛错', () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        buckets: { rules: [{ name: 'a', matchKey: 'foo' as never }] },
      }),
    ).toThrow(/matchKey/);
  });

  it('match 非法类型抛错', () => {
    expect(() =>
      resolveConfig({
        ...baseConfig,
        buckets: { rules: [{ name: 'a', match: 123 as never }] },
      }),
    ).toThrow(/match/);
  });

  it('合法 match / matchKey 通过', () => {
    expect(() =>
      resolveConfig({ ...baseConfig, buckets: { rules: [{ name: 'a', match: 'src/a/**' }] } }),
    ).not.toThrow();
    expect(() =>
      resolveConfig({
        ...baseConfig,
        buckets: { rules: [{ name: 'b', matchKey: (k: string) => k.startsWith('b.') }] },
      }),
    ).not.toThrow();
  });
});

/**
 * 回归（B7）：loadConfigFile 按扩展名分发——.ts/.mts/.cts 走 jiti，其余走原生 import。
 * jiti 对非绝对 specifier 以 loader 模块为基准解析（而非 cwd），原生 import 的 pathToFileURL
 * 则按 cwd 解析。于是同一相对 configPath 因扩展名走不同基准 → 解析到不同文件甚至找不到
 * （README 文档示例 loadConfig('./i18n.config.ts') 即踩中 jiti 分支）。
 * 修复：分发前统一 path.resolve(cwd, configPath) 成绝对路径。
 */
describe('loadConfigFile — 相对 configPath 按 cwd 解析（.mts/jiti 分支）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-rel-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('相对路径的 .mts 配置以 cwd 为基准解析并成功加载', async () => {
    const abs = path.join(tmpDir, 'i18n.config.mts');
    fs.writeFileSync(
      abs,
      `export default { root: '/tmp/b7-root', framework: { type: 'vue' }, ` +
        `llm: { shared: { apiKey: 'x', model: 'm' } } };\n`,
      'utf-8',
    );

    // 构造一个相对 cwd 的路径（修复前 jiti 会以 loader 模块为基准解析 → 找不到）
    const rel = path.relative(process.cwd(), abs);
    expect(path.isAbsolute(rel)).toBe(false);

    const cfg = await loadConfigFile(rel);
    expect(cfg?.root).toBe('/tmp/b7-root');
    expect(cfg?.framework.type).toBe('vue');
  });
});

/**
 * 回归（审计修复）：loader 配置守卫
 *  - 审计 ⑥：locales.source / 每个 target 的空串/纯空白必须 fail-fast（否则落出畸形 `.json`）。
 *  - 审计 ③：用户提供 io.exclude 时整体替换默认值，必须强制并入 node_modules/.git 安全集；
 *            含 '/' 的 literal exclude 仅按 basename 匹配、永远命中不了，应给出告警。
 */
describe('loader 配置守卫（审计修复 ③/⑥）', () => {
  afterEach(() => vi.restoreAllMocks());

  const auditBase = (over: Partial<I18nToolsConfig> = {}): I18nToolsConfig => ({
    root: process.cwd(),
    framework: { type: 'vue' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: { localesDir: 'src/i18n', sourceDir: 'src' },
    llm: { shared: { apiKey: 'x', model: 'm' } },
    ...over,
  });

  it('locales.source 为空串 → 抛错', () => {
    expect(() => resolveConfig(auditBase({ locales: { source: '', targets: ['en-US'] } }))).toThrow(
      /locales\.source/,
    );
  });

  it('locales.source 为纯空白 → 抛错', () => {
    expect(() =>
      resolveConfig(auditBase({ locales: { source: '  ', targets: ['en-US'] } })),
    ).toThrow(/locales\.source/);
  });

  it('locales.targets 含空串 → 抛错', () => {
    expect(() =>
      resolveConfig(auditBase({ locales: { source: 'zh-CN', targets: ['en-US', ''] } })),
    ).toThrow(/locales\.targets/);
  });

  it('合法 locales 不受影响', () => {
    expect(() =>
      resolveConfig(auditBase({ locales: { source: 'zh-CN', targets: ['en-US', 'ja-JP'] } })),
    ).not.toThrow();
  });

  it('用户 io.exclude 强制并入 node_modules/.git 安全集', () => {
    const resolved = resolveConfig(auditBase({ io: { exclude: ['legacy'] } }));
    expect(resolved.io.exclude).toContain('node_modules');
    expect(resolved.io.exclude).toContain('.git');
    expect(resolved.io.exclude).toContain('legacy');
  });

  it('未配置 io.exclude → 保留含测试/故事/构建产物的完整默认集', () => {
    const resolved = resolveConfig(auditBase());
    expect(resolved.io.exclude).toContain('node_modules');
    expect(resolved.io.exclude).toEqual(expect.arrayContaining(['**/*.test.*', '**/*.stories.*']));
  });

  it('含 "/" 的 literal exclude 给出告警（仅 basename 匹配命中不了）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveConfig(auditBase({ io: { exclude: ['src/legacy'] } }));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/src\/legacy/));
  });

  it('glob 形式的 exclude（含 \\*\\*）不触发告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveConfig(auditBase({ io: { exclude: ['**/legacy/**'] } }));
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/命中不了/));
  });
});

/**
 * 回归（审计 Low）：keys.separator 为空串时必须 fail-fast。
 *
 * 根因（修复前）：`separator: userConfig.keys?.separator ?? DEFAULT` 对 '' 不兜底（'' 非
 * nullish），flat 格式也不校验 separator（nested 才强制 '.'）。空串下 id-generator 用
 * split('')/join('') 拼接 key 段：固定前缀被炸成逐字符，且 ['a','bc'] 与 ['ab','c'] 这类
 * 不同段序列拼成同一 key（碰撞）。
 */
describe('config — keys.separator 空串校验', () => {
  function separatorBase(separator: string): I18nToolsConfig {
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
    expect(() => resolveConfig(separatorBase(''))).toThrow(/separator 必须是非空字符串/);
  });

  it('正常 separator（"."）通过', () => {
    expect(() => resolveConfig(separatorBase('.'))).not.toThrow();
  });

  it('多字符 separator（"__"）在 flat 下仍合法', () => {
    expect(() => resolveConfig(separatorBase('__'))).not.toThrow();
  });
});
