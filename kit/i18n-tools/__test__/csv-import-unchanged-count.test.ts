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
 * 回归：csv-import 预览的「将更新」应是「值真正发生变化」的处数，而非「待写入的非空单元格」总数。
 *
 * Why：典型工作流是 csv-export 导出 → 人工只改其中一两格 → 回流。若预览把「原样回流」的
 * 单元格也计入「将更新 N 处」，N 会等于整表行数，让审校者误以为自己动了全表。
 * 与现值相同的单元格应计入「保持不变」并跳过（不标脏、不重写文件）。
 */
describe('CsvImportProcessor 变更计数', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-import-unchanged-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
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
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  }

  function writeUntranslated(data: Record<string, Record<string, string>>) {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), JSON.stringify(data, null, 2));
  }
  function writeCsv(name: string, rows: string[][]): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, serializeCsv(rows));
    return p;
  }

  it('与现值相同的译文计入「保持不变」而非「将更新」（dry-run）', async () => {
    writeUntranslated({
      a: { 'zh-CN': '甲', 'en-US': 'Jia' }, // 已有译文
      b: { 'zh-CN': '乙', 'en-US': '' }, // 待翻
    });
    const input = writeCsv('in.csv', [
      ['key', 'zh-CN', 'en-US', 'reason'],
      ['a', '甲', 'Jia', ''], // 与现值完全相同 → 保持不变
      ['b', '乙', 'Yi', ''], // 新译文 → 将更新
    ]);
    const infoSpy = vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});

    await new CsvImportProcessor(makeConfig(), false, {
      input,
      dryRun: true,
      ci: true,
    }).execute();

    const lines = infoSpy.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => /将更新\s+1 处/.test(l))).toBe(true);
    expect(lines.some((l) => /保持不变\s+1 处/.test(l))).toBe(true);
  });

  it('整表原样回流：updated=0 → 不重写文件', async () => {
    writeUntranslated({
      a: { 'zh-CN': '甲', 'en-US': 'Jia' },
      b: { 'zh-CN': '乙', 'en-US': 'Yi' },
    });
    const input = writeCsv('in.csv', [
      ['key', 'zh-CN', 'en-US', 'reason'],
      ['a', '甲', 'Jia', ''],
      ['b', '乙', 'Yi', ''],
    ]);
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    const target = path.join(localeDir, 'untranslated.json');
    const before = fs.readFileSync(target, 'utf8');

    await new CsvImportProcessor(makeConfig(), false, {
      input,
      dryRun: false,
      ci: true,
    }).execute();

    // 全部与现值一致 → 没有变更 → 文件内容保持原样（含原缩进），未触发重写
    expect(fs.readFileSync(target, 'utf8')).toBe(before);
  });
});
