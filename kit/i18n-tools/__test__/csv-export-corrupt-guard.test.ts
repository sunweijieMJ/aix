import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CsvExportProcessor } from '../src/core/CsvExportProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 回归：CsvExport 原用 safeLoadJsonFile 读数据源（解析失败回退 {}），损坏的 untranslated.json
 * 会被当成 0 条目导出仅含表头的空 CSV 并伪报成功——破坏全仓「损坏即中止」对称性。
 * 修复：改用 readFileSync + safeParseJson===null → throw，区分「空」与「损坏」。
 */
describe('CsvExportProcessor — 损坏数据源守卫', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-export-corrupt-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const makeConfig = (): ResolvedConfig =>
    resolveConfig({
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } as I18nToolsConfig);

  const run = () =>
    new CsvExportProcessor(makeConfig(), false, {
      source: 'untranslated',
      filter: 'all',
    }).execute();

  it('损坏 JSON → 抛错中止，不产出空 CSV', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '{ "a": broken');
    await expect(run()).rejects.toThrow(/解析失败/);
    expect(fs.existsSync(path.join(localeDir, 'i18n.csv'))).toBe(false);
  });

  it('数据源文件不存在 → 抛错中止', async () => {
    await expect(run()).rejects.toThrow(/不存在/);
  });

  it('空文件 → 视为 0 条目正常导出（仅表头），不抛错', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '');
    await expect(run()).resolves.toBeUndefined();
    expect(fs.existsSync(path.join(localeDir, 'i18n.csv'))).toBe(true);
  });
});
