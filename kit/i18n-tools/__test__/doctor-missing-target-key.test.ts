import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DoctorProcessor } from '../src/core/DoctorProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：doctor 对账盲区——checkMissingKeys 只查 source locale，checkUntranslated/
 * checkPlaceholders 又在 target===undefined 时 continue（注释「缺译归 missing 类」），
 * 但 missing 类从不查 target。于是「源码+源 locale 都有该 key，却在某 target 完全缺失」
 * 这一最常见的「代码已发布、翻译没准备好」场景被完全静默。
 * 修复：新增 per-target 的 missing-target-key 检查（源 value 含中文且未被 skip 时）。
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
