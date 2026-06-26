import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ExportProcessor } from '../src/core/ExportProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：桶式导出此前只读 localesDir，完全忽略 io.customDir → 定制语言包被静默丢弃。
 * 修复后桶式与 flat 路径对称：合并 base/custom + 冲突检测。
 */
describe('ExportProcessor 桶式导出合并 customDir', () => {
  let rootDir: string;
  let baseDir: string;
  let customDir: string;
  let outDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(rootDir, 'src'),
        localesDir: baseDir,
        customDir,
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      buckets: {
        rules: [{ name: 'order', matchKey: (k: string) => k.startsWith('order.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-bucket-'));
    baseDir = path.join(rootDir, 'locale');
    customDir = path.join(rootDir, 'custom');
    outDir = path.join(rootDir, 'out');
    fs.mkdirSync(baseDir, { recursive: true });
    fs.mkdirSync(customDir, { recursive: true });

    // 基础包（flat 单文件，导出时会被迁移到桶式）
    fs.writeFileSync(
      path.join(baseDir, 'zh-CN.json'),
      JSON.stringify({ 'order.title': '订单', 'home.title': '首页' }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(baseDir, 'en-US.json'),
      JSON.stringify({ 'order.title': 'Order', 'home.title': 'Home' }),
      'utf-8',
    );
    // 定制包：含 base 中不存在的 key
    fs.writeFileSync(
      path.join(customDir, 'zh-CN.json'),
      JSON.stringify({ 'custom.label': '定制' }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(customDir, 'en-US.json'),
      JSON.stringify({ 'custom.label': 'Custom' }),
      'utf-8',
    );

    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const readBucket = (locale: string, bucket: string): Record<string, string> =>
    JSON.parse(fs.readFileSync(path.join(outDir, locale, `${bucket}.json`), 'utf-8'));

  it('定制 key 进入导出产物（不再被丢弃）', async () => {
    await new ExportProcessor(buildConfig()).execute(outDir);

    // custom.label 未匹配规则 → 落 defaultBucket 'common'
    const zhCommon = readBucket('zh-CN', 'common');
    expect(zhCommon['custom.label']).toBe('定制');
    expect(zhCommon['home.title']).toBe('首页');

    const enCommon = readBucket('en-US', 'common');
    expect(enCommon['custom.label']).toBe('Custom');

    // 规则命中的仍正确分桶
    const zhOrder = readBucket('zh-CN', 'order');
    expect(zhOrder['order.title']).toBe('订单');
  });

  it('base/custom key 冲突 → 抛错（与 flat 路径同口径）', async () => {
    // 让 custom 与 base 重复 home.title
    fs.writeFileSync(
      path.join(customDir, 'zh-CN.json'),
      JSON.stringify({ 'home.title': '冲突' }),
      'utf-8',
    );
    await expect(new ExportProcessor(buildConfig()).execute(outDir)).rejects.toThrow(/冲突/);
  });
});
