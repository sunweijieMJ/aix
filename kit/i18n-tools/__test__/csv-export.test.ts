import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CsvExportProcessor } from '../src/core/CsvExportProcessor';
import { parseCsv } from '../src/utils/csv-utils';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

describe('CsvExportProcessor', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-export-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeConfig(): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US', 'ja-JP'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  }

  function writeUntranslated(data: Record<string, Record<string, string>>) {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), JSON.stringify(data, null, 2));
  }

  function readCsv(): string[][] {
    return parseCsv(fs.readFileSync(path.join(localeDir, 'i18n.csv'), 'utf8'));
  }

  it('单语言导出：列为 key/source/lang/reason，空值 reason 留空、垃圾值标 invalid', async () => {
    writeUntranslated({
      'user.name': { 'zh-CN': '姓名', 'en-US': '', 'ja-JP': '名前' },
      'home.cfg': { 'zh-CN': '配置', 'en-US': '……', 'ja-JP': '' },
    });

    await new CsvExportProcessor(makeConfig(), false, {
      source: 'untranslated',
      filter: 'all',
      langs: ['en-US'],
    }).execute();

    const rows = readCsv();
    expect(rows[0]).toEqual(['key', 'zh-CN', 'en-US', 'reason']);
    const byKey = Object.fromEntries(rows.slice(1).map((r) => [r[0], r]));
    // 空值不再写 reason，置空
    expect(byKey['user.name']).toEqual(['user.name', '姓名', '', '']);
    // '……' 是纯标点，isValidTranslation 不过 → invalid
    expect(byKey['home.cfg']).toEqual(['home.cfg', '配置', '……', 'invalid']);
  });

  it('--filter untranslated 只导该语言未通过 isValidTranslation 的行', async () => {
    writeUntranslated({
      a: { 'zh-CN': '甲', 'en-US': '', 'ja-JP': 'A' },
      b: { 'zh-CN': '乙', 'en-US': 'B', 'ja-JP': '' },
    });

    await new CsvExportProcessor(makeConfig(), false, {
      source: 'untranslated',
      filter: 'untranslated',
      langs: ['en-US'],
    }).execute();

    const keys = readCsv()
      .slice(1)
      .map((r) => r[0]);
    expect(keys).toEqual(['a']); // b 的 en-US 已是 'B'（有效），被过滤掉
  });

  it('多语言导出：去掉 reason 列，每个 target 一列', async () => {
    writeUntranslated({
      a: { 'zh-CN': '甲', 'en-US': '', 'ja-JP': 'A' },
    });

    await new CsvExportProcessor(makeConfig(), false, {
      source: 'untranslated',
      filter: 'all',
      langs: ['en-US', 'ja-JP'],
    }).execute();

    // 多语言也是同一个文件 i18n.csv，语言为列
    const rows = readCsv();
    expect(rows[0]).toEqual(['key', 'zh-CN', 'en-US', 'ja-JP']);
    expect(rows[1]).toEqual(['a', '甲', '', 'A']);
  });

  it('--source translations 读 translations.json', async () => {
    fs.writeFileSync(
      path.join(localeDir, 'translations.json'),
      JSON.stringify({ x: { 'zh-CN': '源', 'en-US': 'src' } }, null, 2),
    );

    await new CsvExportProcessor(makeConfig(), false, {
      source: 'translations',
      filter: 'all',
      langs: ['en-US'],
    }).execute();

    // 已翻译 → reason 留空
    expect(readCsv().slice(1)).toEqual([['x', '源', 'src', '']]);
  });
});
