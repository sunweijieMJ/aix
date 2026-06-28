import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DoctorProcessor } from '../src/core/DoctorProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * DoctorProcessor 集成测试。
 *
 * 用真实 fs 而不是 mock：doctor 的核心价值就是扫文件系统做对账，
 * 用 mock 验证不了它实际能否正确识别 missing/orphan/untranslated。
 */
const buildConfig = (rootDir: string, sourceDir: string, localeDir: string): ResolvedConfig => {
  const user: I18nToolsConfig = {
    root: rootDir,
    framework: { type: 'vue', tImport: '@/locale' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: { localesDir: localeDir, sourceDir, format: 'flat' },
    keys: { separator: '.' },
    llm: { shared: { apiKey: 'x', model: 'm' } },
  };
  return resolveConfig(user);
};

describe('DoctorProcessor', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let successSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-test-'));
    sourceDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });

    infoSpy = vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    // 屏蔽 warn / error / success 输出避免污染测试报告；不需要断言
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    successSpy = vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const writeSourceFile = (rel: string, content: string): void => {
    const abs = path.join(sourceDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  const writeLocale = (locale: string, data: Record<string, string>): void => {
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), JSON.stringify(data));
  };
  const collectMessages = (spy: ReturnType<typeof vi.spyOn>): string =>
    spy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  it('placeholder-mismatch：译文漏占位符 → error，--ci 卡住', async () => {
    writeSourceFile('P.vue', `<template>{{ t('cart.total') }}</template>`);
    writeLocale('zh-CN', { 'cart.total': '共 {count} 件' });
    writeLocale('en-US', { 'cart.total': 'total items' }); // 漏 {count}
    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: true,
    });
    await expect(proc.execute()).rejects.toThrow(/Doctor CI check failed/);
    const all = collectMessages(infoSpy);
    expect(all).toContain('[placeholder-mismatch]');
    expect(all).toContain('cart.total');
  });

  it('placeholder-mismatch：译文多出占位符 → warning，--ci 不卡', async () => {
    writeSourceFile('P.vue', `<template>{{ t('greet') }}</template>`);
    writeLocale('zh-CN', { greet: '你好' });
    writeLocale('en-US', { greet: 'Hi {name}' }); // 多出 {name}
    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: true,
    });
    await expect(proc.execute()).resolves.toBeUndefined();
    expect(collectMessages(infoSpy)).toContain('[placeholder-mismatch]');
  });

  it('placeholder 一致 → 不报', async () => {
    writeSourceFile('P.vue', `<template>{{ t('cart.total') }}</template>`);
    writeLocale('zh-CN', { 'cart.total': '共 {count} 件' });
    writeLocale('en-US', { 'cart.total': '{count} items' });
    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();
    expect(collectMessages(infoSpy)).not.toContain('[placeholder-mismatch]');
  });

  it("配置 namespace 时不把 t('ns:key') 误报为 missing-key", async () => {
    writeSourceFile('Login.vue', `<template><div>{{ $t('app:greeting') }}</div></template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const user: I18nToolsConfig = {
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18next', namespace: 'app', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: localeDir, sourceDir, format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    const proc = new DoctorProcessor(resolveConfig(user));
    await proc.execute();

    // 剥掉 'app:' 前缀后 'greeting' 与 locale 对齐 → 不应出现 missing-key
    const allMessages = collectMessages(infoSpy) + '\n' + collectMessages(successSpy);
    expect(allMessages).not.toContain("t('app:greeting')");
    expect(collectMessages(successSpy)).toContain('Doctor 检查通过');
  });

  it('完全干净：source 与 target 完整对齐 → 检查通过', async () => {
    writeSourceFile('Login.vue', `<template><div>{{ t('greeting') }}</div></template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const successMessages = collectMessages(successSpy);
    expect(successMessages).toContain('Doctor 检查通过');
  });

  it('missing-key：源码 t() 引用了不存在的 key', async () => {
    writeSourceFile('Foo.vue', `<template><span>{{ t('not.exist') }}</span></template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).toContain('[missing-key]');
    expect(all).toContain('not.exist');
  });

  it('orphan-key：locale 中的 key 源码无引用', async () => {
    writeSourceFile('Bar.vue', `<template><div>{{ t('greeting') }}</div></template>`);
    writeLocale('zh-CN', { greeting: '你好', unused: '没人用' });
    writeLocale('en-US', { greeting: 'Hello', unused: 'Nobody uses' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).toContain('[orphan-key]');
    expect(all).toContain('unused');
  });

  it('untranslated：target value 与 source value 完全相同（含中文）', async () => {
    writeSourceFile('Z.vue', `<template>{{ t('a') }}{{ t('b') }}</template>`);
    writeLocale('zh-CN', { a: '完成', b: 'TCP/IP' });
    // a 漏译（中文 = 中文），b 不算（无中文）
    writeLocale('en-US', { a: '完成', b: 'TCP/IP' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).toContain('[untranslated]');
    expect(all).toContain('a (en-US 与 zh-CN 完全相同)');
    // b 不应报：源 value 无中文，符合 "纯英文/符号不参与判定" 设计
    expect(all).not.toContain('b (en-US 与 zh-CN 完全相同)');
  });

  it('注释中的 t() 调用不计入引用（不报 missing-key）', async () => {
    // 行注释、块注释、HTML 注释中的 t('xxx') 都属于"被注释掉的示例代码"，
    // 不应被当成真实引用。否则会引发 missing-key false-positive。
    writeSourceFile(
      'Commented.js',
      [
        `// const a = t('comment.line');`,
        `/* const b = t('comment.block'); */`,
        `const c = t('greeting');`,
      ].join('\n'),
    );
    writeSourceFile(
      'CommentedTpl.vue',
      [
        `<template>`,
        `  <!-- {{ t('comment.html') }} -->`,
        `  <div>{{ t('greeting') }}</div>`,
        `</template>`,
      ].join('\n'),
    );
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).not.toContain('comment.line');
    expect(all).not.toContain('comment.block');
    expect(all).not.toContain('comment.html');
    expect(all).not.toContain('[missing-key]');
  });

  it('CI 模式 + missing-key 存在 → 抛错', async () => {
    writeSourceFile('Q.vue', `<template>{{ t('absent') }}</template>`);
    writeLocale('zh-CN', {});
    writeLocale('en-US', {});

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: true,
    });
    await expect(proc.execute()).rejects.toThrow(/Doctor CI check failed/);
  });

  it('hardcoded-comparison：独立 doctor 自扫源码检出比较运算中的中文（B5 gap 修复）', async () => {
    // 源码里 status === '进行中'：中文是比较操作数（提取时被跳过），且该中文已是 locale 值。
    // 修复前：检测依赖 generate 阶段填充的 drain，独立 doctor 永远扫不到。
    writeSourceFile(
      'Status.ts',
      `export const label = (status: string): string => {\n  if (status === '进行中') return 'running';\n  return 'idle';\n};\n`,
    );
    writeLocale('zh-CN', { inProgress: '进行中' });
    writeLocale('en-US', { inProgress: 'In Progress' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).toContain('[hardcoded-comparison]');
    expect(all).toContain('进行中');
  });

  it('hardcoded-comparison + CI 模式 → 抛错（error 门禁对独立 doctor 生效）', async () => {
    writeSourceFile(
      'Status.ts',
      `export const label = (status: string): string => {\n  if (status === '已完成') return 'done';\n  return 'idle';\n};\n`,
    );
    writeLocale('zh-CN', { done: '已完成' });
    writeLocale('en-US', { done: 'Done' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: true,
    });
    await expect(proc.execute()).rejects.toThrow(/Doctor CI check failed/);
  });

  it('missing-key：源码引用与 Object.prototype 同名的 key（toString），locale 不存在时仍应报（回归 #7）', async () => {
    // 旧实现 `if (!(key in sourceMap))` 用 in 运算符走原型链：sourceMap 是 flattenObject
    // 产出的普通对象，继承 Object.prototype.toString 等，故 'toString' in sourceMap 恒为
    // true → missing-key（doctor 唯一 error 级、CI 门禁）被静默漏报，而运行时实际显示 key 串。
    writeSourceFile('Proto.vue', `<template><span>{{ t('toString') }}</span></template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collectMessages(infoSpy);
    expect(all).toContain('[missing-key]');
    expect(all).toContain('toString');
  });

  it('CI 模式 + 仅 warning 级问题 → 不抛错（仅 error 才阻塞 CI）', async () => {
    writeSourceFile('R.vue', `<template>{{ t('greeting') }}</template>`);
    writeLocale('zh-CN', { greeting: '你好', orphan: '没人用' });
    writeLocale('en-US', { greeting: 'Hello', orphan: 'unused' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: true,
    });
    // orphan-key 仅 warning，CI 模式应正常通过
    await expect(proc.execute()).resolves.toBeUndefined();
    // 确认 warn 级问题被识别
    const all = collectMessages(infoSpy);
    expect(all).toContain('[orphan-key]');
  });
});

/**
 * 回归：doctor 的 --ci 退出码与持久化报告 summary.bySeverity 口径不一致。
 *
 * --ci 闸门按 `findings.filter(severity === 'error')` 统计（含 error 级 lint：
 * hardcoded-comparison）；但 recordToReport 把 locale-lint 类发现整体跳过 addWarning，
 * 只经 LocaleValueLinter.emit 写入 needsManual——其 error severity 从未进入 severityTally。
 * 结果：进程以「N 个 error」失败退出，落盘报告却写 bySeverity.error=0，读 JSON 的看板会
 * 误判为「健康」。修复：error 级 lint 发现须同时计入 bySeverity（与 --ci 同源）。
 */
describe('DoctorProcessor --ci 与报告 severity 口径一致', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-sev-'));
    sourceDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(sourceDir, { recursive: true });
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

  const readLatestReport = (): {
    summary: { bySeverity: Record<string, number>; needsManual: number };
  } => {
    const logsDir = path.join(rootDir, '.i18n-tools', 'logs');
    const file = fs
      .readdirSync(logsDir)
      .filter((f) => /^run-.*\.json$/.test(f))
      .sort()
      .pop();
    if (!file) throw new Error('no report flushed');
    return JSON.parse(fs.readFileSync(path.join(logsDir, file), 'utf-8'));
  };

  it('error 级 lint（hardcoded-comparison）计入 summary.bySeverity.error', async () => {
    // 源码 status === '已完成'：比较操作数（提取时跳过），且 '已完成' 已是 locale 值
    fs.writeFileSync(
      path.join(sourceDir, 'Status.ts'),
      `export const label = (status: string): string => {\n` +
        `  if (status === '已完成') return 'done';\n` +
        `  return 'idle';\n` +
        `};\n`,
    );
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ done: '已完成' }));
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({ done: 'Done' }));

    // ci=false：只产出报告、不抛错，便于读 summary
    await new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: false,
    }).execute();

    const report = readLatestReport();
    // 修复前：bySeverity.error===0（与 --ci「1 个 error」矛盾）
    expect(report.summary.bySeverity.error).toBe(1);
    // 明细仍保留在 needsManual 中（不丢可操作信息）
    expect(report.summary.needsManual).toBeGreaterThanOrEqual(1);
  });
});

/**
 * 回归：doctor 对账盲区——checkMissingKeys 只查 source locale，checkUntranslated/
 * checkPlaceholders 又在 target===undefined 时 continue（注释「缺译归 missing 类」），
 * 但 missing 类从不查 target。于是「源码+源 locale 都有该 key，却在某 target 完全缺失」
 * 这一最常见的「代码已发布、翻译没准备好」场景被完全静默。
 * 修复：新增 per-target 的 missing-target-key 检查（源 value 含中文且未被 skip 时）。
 */
describe('DoctorProcessor missing-target-key', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-mtk-'));
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

  it('源含中文 key、target locale 完全缺失 → 报 missing-target-key', async () => {
    fs.writeFileSync(path.join(sourceDir, 'P.vue'), `<template>{{ t('order.submit') }}</template>`);
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN.json'),
      JSON.stringify({ 'order.submit': '提交订单' }),
    );
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({})); // target 缺该 key

    await new DoctorProcessor(
      buildConfig(rootDir, sourceDir, localeDir),
      false,
      undefined,
      {},
    ).execute();

    expect(all()).toContain('[missing-target-key]');
    expect(all()).toContain('order.submit');
  });

  it('target 已有该 key → 不报 missing-target-key', async () => {
    fs.writeFileSync(path.join(sourceDir, 'P.vue'), `<template>{{ t('order.submit') }}</template>`);
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN.json'),
      JSON.stringify({ 'order.submit': '提交订单' }),
    );
    fs.writeFileSync(
      path.join(localeDir, 'en-US.json'),
      JSON.stringify({ 'order.submit': 'Submit' }),
    );

    await new DoctorProcessor(
      buildConfig(rootDir, sourceDir, localeDir),
      false,
      undefined,
      {},
    ).execute();

    expect(all()).not.toContain('[missing-target-key]');
  });

  it('源 value 纯英文/符号缺 target → 不噪报（无需翻译）', async () => {
    fs.writeFileSync(path.join(sourceDir, 'P.vue'), `<template>{{ t('proto') }}</template>`);
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ proto: 'TCP/IP' }));
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({}));

    await new DoctorProcessor(
      buildConfig(rootDir, sourceDir, localeDir),
      false,
      undefined,
      {},
    ).execute();

    expect(all()).not.toContain('[missing-target-key]');
  });
});
