import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CsvImportProcessor } from '../src/core/CsvImportProcessor';
import { serializeCsv } from '../src/utils/csv-utils';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 回归（B5）：csv-import 用 safeLoadJsonFile 读 untranslated.json（解析失败回退 {}），
 * 损坏字典被当成 0 条目 → CSV 里本应命中的 key 全部落入 missingKeys、审核员译文被
 * 静默丢弃却退出成功。CsvExportProcessor 早已对同一风险「损坏即中止」。修复：csv-import
 * 同样在有内容却 JSON 解析失败时抛错中止。
 */
describe('CsvImportProcessor — 损坏字典即中止（不静默丢弃回流译文）', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-corrupt-'));
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

  function writeCsv(): string {
    const input = path.join(tmpDir, 'in.csv');
    fs.writeFileSync(
      input,
      serializeCsv([
        ['key', 'zh-CN', 'en-US', 'reason'],
        ['a', '甲', 'Jia', ''],
      ]),
    );
    return input;
  }

  it('untranslated.json 内容损坏（非空不可解析）时抛错中止', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '{ this is not json');
    const input = writeCsv();

    await expect(
      new CsvImportProcessor(makeConfig(), false, { input, dryRun: false, ci: true }).execute(),
    ).rejects.toThrow(/JSON 格式损坏/);
  });

  it('untranslated.json 为空文件时按空字典处理，不抛错', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '   ');
    const input = writeCsv();

    // 空字典 → key 不命中，按 missing 跳过即可，不应抛错
    await expect(
      new CsvImportProcessor(makeConfig(), false, { input, dryRun: false, ci: true }).execute(),
    ).resolves.toBeUndefined();
  });
});
