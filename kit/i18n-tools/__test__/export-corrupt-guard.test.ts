import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ExportProcessor } from '../src/core/ExportProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：export 是发布最后一步，却是唯一没有损坏文件守卫的 processor。损坏 locale 被
 * safeLoadJsonFile 静默当成 {} → 导出空语言包覆盖上次产物；而末尾「验证」拿刚写出的空
 * merged 跟自己回读对账必然相等 → 打印「✅ 导出文件验证通过」，把数据丢失伪报成功。
 * 修复：export 前对 source + 全部 targets 做损坏守卫，命中即中止（与 Pick/Merge/Prune 一致）。
 */
describe('ExportProcessor 损坏守卫', () => {
  let rootDir: string;
  let localeDir: string;
  let exportDir: string;

  const buildConfig = (extra: Partial<I18nToolsConfig> = {}): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(rootDir, 'src'),
        localesDir: localeDir,
        exportDir,
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
      ...extra,
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-corrupt-'));
    localeDir = path.join(rootDir, 'locale');
    exportDir = path.join(rootDir, 'dist-locale');
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

  it('单文件：source locale 损坏 → 中止 export，不导出空包', async () => {
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{ "a.b": "存量"', 'utf-8'); // 损坏
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({ 'a.b': 'val' }), 'utf-8');

    await expect(new ExportProcessor(buildConfig()).execute()).rejects.toThrow(
      /zh-CN.*(损坏|解析失败)|(损坏|解析失败).*zh-CN/,
    );

    // 没有把空包写到 exportDir（更没有伪报「验证通过」）
    expect(fs.existsSync(path.join(exportDir, 'zh-CN.json'))).toBe(false);
  });

  it('桶式：target 桶损坏 → 中止 export', async () => {
    const config = buildConfig({
      buckets: {
        rules: [{ name: 'misc', matchKey: (k: string) => k.startsWith('zzz.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(path.join(localeDir, 'zh-CN'), { recursive: true });
    fs.mkdirSync(path.join(localeDir, 'en-US'), { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN', 'common.json'),
      JSON.stringify({ 'a.b': '存量' }),
      'utf-8',
    );
    fs.writeFileSync(path.join(localeDir, 'en-US', 'common.json'), '{ not json', 'utf-8'); // 损坏

    await expect(new ExportProcessor(config).execute()).rejects.toThrow(
      /en-US.*(损坏|解析失败)|(损坏|解析失败).*en-US/,
    );
  });

  it('桶式：尚未迁移的遗留单文件损坏 → 中止 export，不静默迁移成空包（#6）', async () => {
    const config = buildConfig({
      buckets: {
        rules: [{ name: 'misc', matchKey: (k: string) => k.startsWith('zzz.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
    });
    // 桶目录尚不存在（首次启用 buckets），仅有遗留单文件，且 source 损坏：
    // 旧行为 → getMessages 触发 migrateToBuckets silent 读 → 当 {} → rename .bak → 导出空包覆盖产物。
    const legacy = path.join(localeDir, 'zh-CN.json');
    fs.writeFileSync(legacy, '{ "a.b": "存量"', 'utf-8'); // 损坏
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({ 'a.b': 'val' }), 'utf-8');

    await expect(new ExportProcessor(config).execute()).rejects.toThrow(
      /zh-CN.*(损坏|解析失败)|(损坏|解析失败).*zh-CN/,
    );

    // 守卫先于迁移触发：损坏遗留文件未被 rename 成 .bak，也没有导出空包
    expect(fs.existsSync(`${legacy}.bak`)).toBe(false);
    expect(fs.existsSync(path.join(exportDir, 'zh-CN'))).toBe(false);
  });
});
