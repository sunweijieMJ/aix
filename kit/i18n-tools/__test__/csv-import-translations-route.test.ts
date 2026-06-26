import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CsvImportProcessor } from '../src/core/CsvImportProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { serializeCsv } from '../src/utils/csv-utils';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：csv-export 支持 --source translations（导出已翻译条目供审核），但 csv-import 把
 * 回写目标硬编码为 untranslated.json。审核员从 translations 导出的 CSV 改完再 import 时，
 * 这些 key 大多已被 pick/merge 移出 untranslated.json → 全部命中 if(!entry) 进 missingKeys
 * 被丢弃；若整批都不在 untranslated.json，updated===0，打印「没有可写回」直接退出，
 * 审核修订仅以一行 warning 静默丢失。
 * 修复：import 自动按 key 归属路由——既写回 untranslated.json，也写回 translations.json。
 */
describe('CsvImportProcessor 自动路由到 translations.json', () => {
  let rootDir: string;
  let localeDir: string;
  let csvPath: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: path.join(rootDir, 'src'), localesDir: localeDir, format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  const readJson = (p: string): Record<string, Record<string, string>> =>
    JSON.parse(fs.readFileSync(p, 'utf-8'));

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-import-route-'));
    localeDir = path.join(rootDir, 'locale');
    csvPath = path.join(rootDir, 'i18n.csv');
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

  it('审核 translations 导出的 CSV 改完回流 → 写回 translations.json，不静默丢弃', async () => {
    const untranslatedPath = path.join(localeDir, 'untranslated.json');
    const translatedPath = path.join(localeDir, 'translations.json');
    // 该 key 已翻译、只存在于 translations.json（pick/merge 已把它移出 untranslated.json）
    fs.writeFileSync(untranslatedPath, JSON.stringify({}));
    fs.writeFileSync(
      translatedPath,
      JSON.stringify({ 'order.title': { 'zh-CN': '我的订单', 'en-US': 'Old Orders' } }),
    );
    // 审核员把 en-US 改成 My Orders
    fs.writeFileSync(
      csvPath,
      serializeCsv([
        ['key', 'zh-CN', 'en-US'],
        ['order.title', '我的订单', 'My Orders'],
      ]),
    );

    await new CsvImportProcessor(buildConfig(), false, {
      input: csvPath,
      dryRun: false,
      ci: true,
    }).execute();

    expect(readJson(translatedPath)['order.title']!['en-US']).toBe('My Orders');
  });

  it('untranslated 导出的 CSV 回流仍写回 untranslated.json（行为不变）', async () => {
    const untranslatedPath = path.join(localeDir, 'untranslated.json');
    const translatedPath = path.join(localeDir, 'translations.json');
    fs.writeFileSync(
      untranslatedPath,
      JSON.stringify({ 'order.tip': { 'zh-CN': '提示', 'en-US': '' } }),
    );
    fs.writeFileSync(translatedPath, JSON.stringify({}));
    fs.writeFileSync(
      csvPath,
      serializeCsv([
        ['key', 'zh-CN', 'en-US'],
        ['order.tip', '提示', 'Tip'],
      ]),
    );

    await new CsvImportProcessor(buildConfig(), false, {
      input: csvPath,
      dryRun: false,
      ci: true,
    }).execute();

    expect(readJson(untranslatedPath)['order.tip']!['en-US']).toBe('Tip');
  });
});
