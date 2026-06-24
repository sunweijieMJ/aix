import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PruneProcessor } from '../src/core/PruneProcessor';
import { InteractiveUtils } from '../src/utils/interactive-utils';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

const buildConfig = (
  rootDir: string,
  sourceDir: string,
  localeDir: string,
  extra: Partial<I18nToolsConfig> = {},
): ResolvedConfig => {
  const user: I18nToolsConfig = {
    root: rootDir,
    framework: { type: 'vue', tImport: '@/locale' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: { localesDir: localeDir, sourceDir, format: 'flat' },
    keys: { separator: '.' },
    llm: { shared: { apiKey: 'x', model: 'm' } },
    ...extra,
  };
  return resolveConfig(user);
};

describe('PruneProcessor', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-test-'));
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

  const writeSource = (rel: string, content: string): void => {
    const abs = path.join(sourceDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  const writeLocale = (locale: string, data: Record<string, string>): void => {
    fs.writeFileSync(path.join(localeDir, `${locale}.json`), JSON.stringify(data));
  };
  const readLocale = (locale: string): Record<string, string> =>
    JSON.parse(fs.readFileSync(path.join(localeDir, `${locale}.json`), 'utf8'));

  it('删除孤儿 key（source + 所有 target）', async () => {
    writeSource('A.vue', `<template>{{ t('used') }}</template>`);
    writeLocale('zh-CN', { used: '用', orphan: '没人用' });
    writeLocale('en-US', { used: 'used', orphan: 'unused' });

    await new PruneProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      dryRun: false,
      ci: true,
    }).execute();

    expect(readLocale('zh-CN')).toEqual({ used: '用' });
    expect(readLocale('en-US')).toEqual({ used: 'used' });
  });

  it('--dry-run 只预览不删', async () => {
    writeSource('A.vue', `<template>{{ t('used') }}</template>`);
    writeLocale('zh-CN', { used: '用', orphan: '没人用' });
    writeLocale('en-US', { used: 'used', orphan: 'unused' });

    await new PruneProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      dryRun: true,
      ci: true,
    }).execute();

    expect(readLocale('zh-CN')).toEqual({ used: '用', orphan: '没人用' }); // 未变
  });

  it('命中 dynamicKeyAllowlist 的 key 不删', async () => {
    writeSource('A.vue', `<template>{{ t('used') }}</template>`);
    writeLocale('zh-CN', { used: '用', 'dyn.a': '动态' });
    writeLocale('en-US', { used: 'used', 'dyn.a': 'dynamic' });

    const config = buildConfig(rootDir, sourceDir, localeDir, {
      keys: { separator: '.', dynamicKeyAllowlist: ['dyn.'] },
    });
    await new PruneProcessor(config, false, undefined, { dryRun: false, ci: true }).execute();

    expect(readLocale('zh-CN')).toEqual({ used: '用', 'dyn.a': '动态' }); // dyn.a 保留
  });

  it('非 --ci：确认 false 时不删', async () => {
    writeSource('A.vue', `<template>{{ t('used') }}</template>`);
    writeLocale('zh-CN', { used: '用', orphan: '没人用' });
    writeLocale('en-US', { used: 'used', orphan: 'unused' });
    vi.spyOn(InteractiveUtils, 'promptForGenericConfirmation').mockResolvedValue(false);

    await new PruneProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      dryRun: false,
      ci: false,
    }).execute();

    expect(readLocale('zh-CN')).toEqual({ used: '用', orphan: '没人用' }); // 取消 → 未删
  });
});
