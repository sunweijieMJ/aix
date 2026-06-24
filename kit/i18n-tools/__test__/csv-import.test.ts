import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CsvImportProcessor } from '../src/core/CsvImportProcessor';
import { serializeCsv } from '../src/utils/csv-utils';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

describe('CsvImportProcessor', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-import-'));
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
  function writeCsv(name: string, rows: string[][]): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, serializeCsv(rows));
    return p;
  }

  it('非空译文写回；空单元格跳过保留原值', async () => {
    writeUntranslated({
      a: { 'zh-CN': '甲', 'en-US': '', 'ja-JP': '旧' },
      b: { 'zh-CN': '乙', 'en-US': 'OLD', 'ja-JP': '' },
    });
    const input = writeCsv('in-en.csv', [
      ['key', 'zh-CN', 'en-US', 'reason', 'note'],
      ['a', '甲', 'Jia', 'empty', ''],
      ['b', '乙', '', 'empty', ''], // 空 → 跳过，保留 OLD
    ]);

    await new CsvImportProcessor(makeConfig(), false, {
      input,
      dryRun: false,
      ci: true,
    }).execute();

    const out = readUntranslated();
    expect(out.a['en-US']).toBe('Jia');
    expect(out.b['en-US']).toBe('OLD'); // 未被空值清空
    expect(out.a['ja-JP']).toBe('旧'); // 其他 target 不动
  });

  it('CSV 有但 JSON 无的 key → 跳过且不新建', async () => {
    writeUntranslated({ a: { 'zh-CN': '甲', 'en-US': '' } });
    const input = writeCsv('in.csv', [
      ['key', 'zh-CN', 'en-US', 'reason', 'note'],
      ['a', '甲', 'Jia', '', ''],
      ['ghost', '幽灵', 'Ghost', '', ''],
    ]);

    await new CsvImportProcessor(makeConfig(), false, {
      input,
      dryRun: false,
      ci: true,
    }).execute();

    const out = readUntranslated();
    expect(out.a['en-US']).toBe('Jia');
    expect(out.ghost).toBeUndefined();
  });

  it('源语言列改动被忽略，不写回 source', async () => {
    writeUntranslated({ a: { 'zh-CN': '甲', 'en-US': '' } });
    const input = writeCsv('in.csv', [
      ['key', 'zh-CN', 'en-US', 'reason', 'note'],
      ['a', '被改的源', 'Jia', '', ''],
    ]);

    await new CsvImportProcessor(makeConfig(), false, {
      input,
      dryRun: false,
      ci: true,
    }).execute();

    expect(readUntranslated().a['zh-CN']).toBe('甲'); // 源不变
  });

  it('多语言 CSV 按列名回写各 target', async () => {
    writeUntranslated({ a: { 'zh-CN': '甲', 'en-US': '', 'ja-JP': '' } });
    const input = writeCsv('in-multi.csv', [
      ['key', 'zh-CN', 'ja-JP', 'en-US', 'note'], // 故意打乱列序
      ['a', '甲', 'コウ', 'Jia', ''],
    ]);

    await new CsvImportProcessor(makeConfig(), false, {
      input,
      dryRun: false,
      ci: true,
    }).execute();

    const out = readUntranslated();
    expect(out.a['en-US']).toBe('Jia');
    expect(out.a['ja-JP']).toBe('コウ');
  });

  it('--dry-run 不写回', async () => {
    writeUntranslated({ a: { 'zh-CN': '甲', 'en-US': '' } });
    const input = writeCsv('in.csv', [
      ['key', 'zh-CN', 'en-US', 'reason', 'note'],
      ['a', '甲', 'Jia', '', ''],
    ]);

    await new CsvImportProcessor(makeConfig(), false, {
      input,
      dryRun: true,
      ci: true,
    }).execute();

    expect(readUntranslated().a['en-US']).toBe(''); // 未变
  });

  it('缺少 key 列时抛错', async () => {
    writeUntranslated({ a: { 'zh-CN': '甲', 'en-US': '' } });
    const input = writeCsv('bad.csv', [
      ['zh-CN', 'en-US'],
      ['甲', 'Jia'],
    ]);

    await expect(
      new CsvImportProcessor(makeConfig(), false, {
        input,
        dryRun: false,
        ci: true,
      }).execute(),
    ).rejects.toThrow(/key/);
  });
});
