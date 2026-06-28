import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ExportProcessor } from '../src/core/ExportProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：flat 导出读路径必须用 config.keys.separator 展平（与 flatten-separator-consistency #12 同类）。
 *
 * 根因：ExportProcessor.performFlatExport 的 loadFlat 调 flattenObject(raw) 漏传 separator，
 * 默认用 '.'。flat 格式 + 非 '.' 分隔符 + 磁盘嵌套 JSON 时，导出包 key（a.b）与运行时/源码使用的
 * key（a/b）不一致 → 导出包整片 missing-key 兜底。文末自检因 key 数量相同而静默放行。
 */
describe('ExportProcessor flat 导出使用 keys.separator', () => {
  let rootDir: string;
  let baseDir: string;
  let outDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(rootDir, 'src'),
        localesDir: baseDir,
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '/' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-flat-sep-'));
    baseDir = path.join(rootDir, 'locale');
    outDir = path.join(rootDir, 'out');
    fs.mkdirSync(baseDir, { recursive: true });
    // 磁盘是嵌套 JSON；flat 格式 + 分隔符 '/'
    fs.writeFileSync(
      path.join(baseDir, 'zh-CN.json'),
      JSON.stringify({ views: { order: { title: '订单' } } }),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(baseDir, 'en-US.json'),
      JSON.stringify({ views: { order: { title: 'Order' } } }),
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

  it('导出 key 用配置的 "/" 分隔符，而非默认 "."', async () => {
    await new ExportProcessor(buildConfig()).execute(outDir);

    const exported = JSON.parse(fs.readFileSync(path.join(outDir, 'zh-CN.json'), 'utf-8'));
    expect(Object.keys(exported)).toEqual(['views/order/title']);
    expect(exported['views/order/title']).toBe('订单');
    // 修复前会得到 'views.order.title'（默认分隔符），与运行时/源码 key 集不一致
    expect(Object.keys(exported)).not.toContain('views.order.title');
  });
});
