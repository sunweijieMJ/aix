import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CsvExportProcessor } from '../src/core/CsvExportProcessor';
import { CsvImportProcessor } from '../src/core/CsvImportProcessor';
import { parseCsv, serializeCsv } from '../src/utils/csv-utils';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 端到端串测：export 多语言 CSV → 模拟人工填译 → import 回流。
 * 验证两个 Processor + csv-utils 串起来 round-trip 无损，且保守合并跨 target 成立。
 */
describe('CSV export → import 多语言串测', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-roundtrip-'));
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
  function readUntranslated(): Record<string, Record<string, string>> {
    return JSON.parse(fs.readFileSync(path.join(localeDir, 'untranslated.json'), 'utf8'));
  }

  it('两个 target 都写回；空单元格保留已有译文；含逗号/引号的值 round-trip 无损', async () => {
    writeUntranslated({
      a: { 'zh-CN': '甲', 'en-US': '', 'ja-JP': '' },
      b: { 'zh-CN': '乙', 'en-US': 'B', 'ja-JP': '' },
    });

    // 1. 导出多语言 CSV（langs 两个 → i18n.csv）
    await new CsvExportProcessor(makeConfig(), false, {
      source: 'untranslated',
      filter: 'all',
      langs: ['en-US', 'ja-JP'],
    }).execute();

    const csvPath = path.join(localeDir, 'i18n.csv');
    expect(fs.existsSync(csvPath)).toBe(true);

    // 2. 模拟人工：解析 → 填空译文（含逗号/引号的边界值）→ 序列化写回同一文件
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    const header = rows[0]!;
    expect(header).toEqual(['key', 'zh-CN', 'en-US', 'ja-JP']);
    const enIdx = header.indexOf('en-US');
    const jaIdx = header.indexOf('ja-JP');
    for (const row of rows.slice(1)) {
      if (row[0] === 'a') {
        row[enIdx] = 'Jia, the "first"'; // 含逗号 + 引号，验证 round-trip
        row[jaIdx] = 'コウ';
      }
      if (row[0] === 'b') {
        row[jaIdx] = 'オツ'; // en-US 留空（已有 'B'）
      }
    }
    fs.writeFileSync(csvPath, serializeCsv(rows));

    // 3. 回流写回 untranslated.json
    await new CsvImportProcessor(makeConfig(), false, {
      input: csvPath,
      dryRun: false,
      ci: true,
    }).execute();

    const out = readUntranslated();
    expect(out.a!['en-US']).toBe('Jia, the "first"'); // 逗号/引号无损
    expect(out.a!['ja-JP']).toBe('コウ');
    expect(out.b!['ja-JP']).toBe('オツ');
    expect(out.b!['en-US']).toBe('B'); // 空单元格未覆盖，保留原值
    expect(out.a!['zh-CN']).toBe('甲'); // 源不变
  });
});
