import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CsvImportProcessor } from '../src/core/CsvImportProcessor';
import { DoctorProcessor } from '../src/core/DoctorProcessor';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { GeneratePlanWriter, type GeneratePlan } from '../src/core/GeneratePlan';
import { FileUtils } from '../src/utils/file-utils';
import { serializeCsv } from '../src/utils/csv-utils';
import { LLMClient } from '../src/utils/llm-client';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 原型链安全合集：覆盖 4 个被测对象的原型链污染 / 原型名 key 防护回归。
 *   1. CsvImportProcessor —— CSV 回流时 __proto__/constructor 等 key 不写穿原型链
 *   2. FileUtils.unflattenObject —— 含原型名中间段的扁平 key 不污染 Object.prototype
 *   3. DoctorProcessor missing-target-key —— 原型名 key 的缺失判定用 own-property 而非 `in`
 *   4. GenerateProcessor dry-run —— 原型名 semanticId 不被 `in` 去重丢弃
 */

describe('CsvImportProcessor — __proto__ 原型污染防护', () => {
  /**
   * 回归：csv-import 回流时 key 来自外部 CSV（翻译人员回传），未经过滤。路由用三元
   * `inUntranslated ? untranslated[key] : translated[key]`，其中 else 分支 `translated[key]`
   * 在修复前是无 own-property 守卫的裸读取。当 CSV 含 key=`__proto__`（或 constructor/prototype）时，
   * `translated['__proto__']` 取到 Object.prototype（继承值、真值），绕过 `if (!entry)`，随后
   * `entry[col.name] = value` 写穿原型链 → 全局原型污染。修复：translated 分支同样 hasOwnProperty 守卫。
   */
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-proto-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    // 防御性清理：若污染发生，避免泄漏到其他测试。
    delete (Object.prototype as Record<string, unknown>)['en-US'];
  });

  function makeConfig(): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  }

  it('CSV 含 __proto__ 行不污染 Object.prototype，且按 missing 跳过', async () => {
    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify({ a: { 'zh-CN': '甲', 'en-US': '' } }, null, 2),
    );
    const input = path.join(tmpDir, 'evil.csv');
    fs.writeFileSync(
      input,
      serializeCsv([
        ['key', 'zh-CN', 'en-US', 'reason'],
        ['__proto__', '恶意', 'PWNED', ''],
        ['constructor', '恶意', 'PWNED', ''],
        ['a', '甲', 'Jia', ''], // 正常 key 仍应写回
      ]),
    );

    await new CsvImportProcessor(makeConfig(), false, {
      input,
      dryRun: false,
      ci: true,
    }).execute();

    // 关键断言：全局原型未被污染
    expect(({} as Record<string, unknown>)['en-US']).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>)['en-US']).toBeUndefined();

    // 正常 key 仍正确写回，污染行不新建
    const out = JSON.parse(
      fs.readFileSync(path.join(localeDir, 'untranslated.json'), 'utf8'),
    ) as Record<string, Record<string, string>>;
    expect(out.a['en-US']).toBe('Jia');
    // 污染行未作为真实数据 key 写入（用 own-property 判定，避开 __proto__ getter）
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(false);
  });
});

describe('FileUtils.unflattenObject — 原型链污染防护', () => {
  /**
   * 回归：unflattenObject 逐段下钻时用 `current[k] = current[k] || {}`，遇到 `__proto__` 中间段
   * 会读到 Object.prototype 并写穿，污染全局原型。键名可来自手写 locale / CSV 回流等外部来源，
   * 且默认 nested 落盘路径（serialize）会触发。修复：拒绝保留段名 + 用 hasOwnProperty 判容器。
   */
  it('含 __proto__ 中间段的键不污染 Object.prototype', () => {
    const result = FileUtils.unflattenObject({ '__proto__.polluted': 'yes' }, '.');
    // 关键：全局原型未被污染
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    // 该非法键被跳过，不出现在结果里
    expect((result as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('constructor / prototype 段名同样被拒绝', () => {
    const result = FileUtils.unflattenObject(
      { 'constructor.x': '1', 'prototype.y': '2', 'a.b': 'ok' },
      '.',
    );
    expect(result).toEqual({ a: { b: 'ok' } });
  });

  it('toString 等原型链属性名作段名不下钻到继承值', () => {
    const result = FileUtils.unflattenObject({ 'toString.x': '1', a: '2' }, '.');
    expect(result.a).toBe('2');
    expect(typeof result.toString).toBe('object');
    expect((result.toString as unknown as Record<string, unknown>).x).toBe('1');
  });

  it('正常嵌套键不受影响', () => {
    const result = FileUtils.unflattenObject(
      { 'views.login.title': '登录', 'views.login.sub': '副' },
      '.',
    );
    expect(result).toEqual({ views: { login: { title: '登录', sub: '副' } } });
  });
});

describe('DoctorProcessor missing-target-key — 原型名 key', () => {
  /**
   * 回归（B8）：checkMissingTargetKeys 用 `key in targetMap` 判断 target 是否已有该 key。
   * `in` 走原型链，名为 'toString'/'constructor' 等的 key 即使 target 真缺失也被误判为已存在，
   * missing-target-key 永远不报（假阴性）。修复：改用 Object.prototype.hasOwnProperty.call，
   * 与 checkMissingKeys/checkOrphanKeys 的判定纪律一致。
   */
  const buildConfig = (rootDir: string, sourceDir: string, localeDir: string): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: localeDir, sourceDir, format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-mtk-proto-'));
    sourceDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    infoSpy = vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const all = (): string => infoSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  it("名为 'toString' 的源 key 在 target 缺失时仍报 missing-target-key（修复前被原型链吞掉）", async () => {
    fs.writeFileSync(path.join(sourceDir, 'P.vue'), `<template>{{ t('toString') }}</template>`);
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ toString: '提交' }));
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({})); // target 真缺失

    await new DoctorProcessor(
      buildConfig(rootDir, sourceDir, localeDir),
      false,
      undefined,
      {},
    ).execute();

    expect(all()).toContain('[missing-target-key]');
    expect(all()).toContain('toString');
  });
});

describe('GenerateProcessor dry-run — 原型名 key 不被 `in` 去重丢弃', () => {
  /**
   * 回归（LOW）：semanticId 为原型成员名（如 'constructor'）时，dry-run plan 的 localeDelta
   * 去重不得用 `in` 运算符把它丢掉。
   *
   * 根因（修复前）：`if (!(item.semanticId in localeDelta))` 走原型链，`'constructor' in {}` 恒为
   * true → 该 key 永不写入 localeDelta。apply 阶段从 plan.localeDelta 重建 locale 值，于是源码被
   * 改成 t('constructor') 却没有对应 locale 条目（源码/locale 不一致）。
   *
   * 修复：改用 Object.prototype.hasOwnProperty.call。
   */
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  // 空前缀（custom 策略返回 []），使 full id 等于裸 semantic 部分 'constructor'
  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      keys: { separator: '.', prefix: { strategy: 'custom', resolve: () => [] } },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-proto-key-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("LLM 返回 id 'constructor' → 该 key 仍写入 plan.localeDelta", async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, `<template><div>提交</div></template>\n`, 'utf-8');

    // 单条文本，LLM 返回原型成员名作为语义 ID
    vi.spyOn(LLMClient.prototype, 'generateSemanticIdsForFiles').mockImplementation(
      async (groups: Record<string, string[]>) => {
        const out: Record<string, string[]> = {};
        for (const fp of Object.keys(groups)) out[fp] = ['constructor'];
        return out;
      },
    );

    await new GenerateProcessor(buildConfig(), false, false).execute(file, false, { dryRun: true });

    const planPath = GeneratePlanWriter.resolveLatest(path.join(rootDir, '.i18n-tools', 'plans'));
    expect(planPath).not.toBeNull();
    const { plan } = GeneratePlanWriter.read(planPath!) as { plan: GeneratePlan };

    // 关键：'constructor' 作为 own property 写入了 localeDelta（修复前会被 `in` 丢弃）
    expect(Object.prototype.hasOwnProperty.call(plan.localeDelta, 'constructor')).toBe(true);
    expect(plan.localeDelta['constructor']).toBe('提交');
  });
});

describe('GenerateProcessor nested — 原型名 key 段在写源码前 fail-fast', () => {
  /**
   * 回归（Bug 1）：io.format='nested'（默认值）下，serialize → unflattenObject 会静默丢弃
   * 段名为 __proto__/constructor/prototype 的 key（原型污染防护，proto-safety 的 unflatten
   * 用例已固化此行为）。但 generate 的 commitToDisk 先写源码、后写 locale：若不在写源码前
   * 拦截这类 key，源码会被改成 t('constructor') 而 locale 静默丢失该 key → exit 0、无警告、
   * 运行时永久 missing-key，破坏「源码与 locale 强一致」不变量。flat 模式正常、仅 nested 丢失
   * 的非对称性证明这是缺陷而非固有限制。
   *
   * 修复：assertSerializableUpdate（写源码前预检）在 nested 模式对本轮新增 semanticId 的每个
   * 段做保留段名校验，与前缀冲突同口径前移 fail-fast，使源码尚未改写时即暴露。
   */
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  // 空前缀（custom 返回 []）使 full id 等于裸 semantic 段 'constructor'
  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'nested', prettify: false },
      keys: { separator: '.', prefix: { strategy: 'custom', resolve: () => [] } },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-nested-proto-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    // 预置空 locale，避免 readLocaleFile 返回 null 干扰（真实项目通常已有 locale 文件）
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{}');
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), '{}');
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("nested 下 LLM 返回 id 'constructor' → 写源码前抛错，源文件保持原中文未改写", async () => {
    const file = path.join(srcDir, 'A.vue');
    const ORIGINAL = `<template><div>提交</div></template>\n`;
    fs.writeFileSync(file, ORIGINAL, 'utf-8');

    vi.spyOn(LLMClient.prototype, 'generateSemanticIdsForFiles').mockImplementation(
      async (groups: Record<string, string[]>) => {
        const out: Record<string, string[]> = {};
        for (const fp of Object.keys(groups)) out[fp] = ['constructor'];
        return out;
      },
    );

    // 关键 1：写源码前 fail-fast（而非静默改源码、丢 locale、exit 0）
    await expect(
      new GenerateProcessor(buildConfig(), false, false).execute(file, false, {}),
    ).rejects.toThrow();

    // 关键 2：不变量——源码未被改写（仍是原中文，而非 t('constructor')）
    expect(fs.readFileSync(file, 'utf-8')).toBe(ORIGINAL);
  });
});
