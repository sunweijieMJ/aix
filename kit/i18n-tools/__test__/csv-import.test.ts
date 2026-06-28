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

/**
 * 回归（审计 ⑦）：csv-import 命中的字典条目若为非对象（手工破坏 schema，如某 key 值是字符串），
 * `!entry` 拦不住真值非对象，旧实现 `entry[col.name] = value` 在严格模式抛 TypeError 崩溃整个回流。
 * 修复：补 `typeof entry !== 'object'` 守卫，并入 missingKeys 跳过，不崩溃、不写坏数据。
 */
describe('CsvImportProcessor — 非对象字典条目守卫（审计 ⑦）', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-nonobj-'));
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

  it('字典某 key 值为字符串（非对象）时不崩溃，按 missing 跳过', async () => {
    // 合法 JSON、但 'a' 的值是字符串而非 {locale: value} 对象（手工破坏 schema）
    const untPath = path.join(localeDir, 'untranslated.json');
    const untContent = JSON.stringify({ a: 'oops-a-string' });
    fs.writeFileSync(untPath, untContent);

    const input = path.join(tmpDir, 'in.csv');
    fs.writeFileSync(
      input,
      serializeCsv([
        ['key', 'zh-CN', 'en-US', 'reason'],
        ['a', '甲', 'Jia', ''],
      ]),
    );

    // 不抛 TypeError
    await expect(
      new CsvImportProcessor(makeConfig(), false, { input, dryRun: false, ci: true }).execute(),
    ).resolves.toBeUndefined();

    // 破坏的字典未被写穿（非对象 entry 未被赋值）
    expect(JSON.parse(fs.readFileSync(untPath, 'utf-8'))).toEqual({ a: 'oops-a-string' });
  });
});
