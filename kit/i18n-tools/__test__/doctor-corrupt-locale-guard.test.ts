import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DoctorProcessor } from '../src/core/DoctorProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归（MEDIUM）：doctor 必须像 Pick/Merge/Prune/Restore/Export 一样有损坏 locale 守卫。
 *
 * 根因（修复前）：doctor 用 `readLocaleFile(...) ?? {}` 吞掉损坏文件。
 *  - 源损坏 → {} → 全部源码 key 误报 missing-key(error)，CI 因错误原因失败；
 *  - 目标损坏 → {} → 刷一堆假 missing-target-key(warning)，CI 仍 exit 0，真损坏被掩盖。
 *
 * 修复：探测到损坏即报 corrupt-locale(error) 并跳过依赖该 locale 的对账，--ci 据此非零退出。
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

describe('DoctorProcessor — 损坏 locale 守卫', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-corrupt-'));
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

  const writeSource = (rel: string, content: string): void =>
    fs.writeFileSync(path.join(sourceDir, rel), content);
  const writeRawLocale = (locale: string, raw: string): void =>
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), raw);
  const writeLocale = (locale: string, data: Record<string, string>): void =>
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), JSON.stringify(data));
  const collect = (spy: ReturnType<typeof vi.spyOn>): string =>
    spy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  it('源 locale 损坏 → 报 corrupt-locale，不把所有 key 误报为 missing-key', async () => {
    writeSource('A.vue', `<template>{{ t('greeting') }}</template>`);
    writeRawLocale('zh-CN', '{ "greeting": "你好"'); // 损坏 JSON（缺右括号）
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    const all = collect(infoSpy);
    expect(all).toContain('[corrupt-locale]');
    // 源不可信 → 跳过对账，不应出现 missing-key 噪声
    expect(all).not.toContain('[missing-key]');
  });

  it('源 locale 损坏 + --ci → 抛错（error 级，CI 如实失败）', async () => {
    writeSource('A.vue', `<template>{{ t('greeting') }}</template>`);
    writeRawLocale('zh-CN', '{ broken');
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: true,
    });
    await expect(proc.execute()).rejects.toThrow(/Doctor CI check failed/);
  });

  it('目标 locale 损坏 + --ci → 抛错（修复前是假 warning + exit 0 掩盖损坏）', async () => {
    writeSource('A.vue', `<template>{{ t('greeting') }}</template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeRawLocale('en-US', '{ "greeting": '); // 损坏 JSON

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: true,
    });
    await expect(proc.execute()).rejects.toThrow(/Doctor CI check failed/);

    const all = collect(infoSpy);
    expect(all).toContain('[corrupt-locale]');
    // 不应把损坏目标的每个 key 刷成 missing-target-key
    expect(all).not.toContain('[missing-target-key]');
  });

  it('locale 全部正常 → 不报 corrupt-locale（不误伤）', async () => {
    writeSource('A.vue', `<template>{{ t('greeting') }}</template>`);
    writeLocale('zh-CN', { greeting: '你好' });
    writeLocale('en-US', { greeting: 'Hello' });

    const proc = new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir));
    await proc.execute();

    expect(collect(infoSpy)).not.toContain('[corrupt-locale]');
  });
});
