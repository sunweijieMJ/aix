import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PruneProcessor } from '../src/core/PruneProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：prune 桶式损坏守卫此前只覆盖 source locale，target 桶损坏会被 safeLoadJsonFile
 * 静默降级为 {}，命中孤儿后整体重写、损坏桶被改名 .bak → key 从活跃 locale 消失。
 * 修复后守卫覆盖 source + 所有 target，任一损坏即中止。
 */
describe('PruneProcessor 桶式损坏守卫覆盖 target', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: srcDir,
        localesDir: localeDir,
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      buckets: {
        rules: [{ name: 'misc', matchKey: (k: string) => k.startsWith('zzz.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-corrupt-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true }); // 空源码目录：usedKeys 为空，全部判孤儿
    // 桶式：source 有效，target 桶损坏
    fs.mkdirSync(path.join(localeDir, 'zh-CN'), { recursive: true });
    fs.mkdirSync(path.join(localeDir, 'en-US'), { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN', 'common.json'),
      JSON.stringify({ 'a.b': '文案' }),
      'utf-8',
    );
    // 损坏的 target 桶（非法 JSON）
    fs.writeFileSync(path.join(localeDir, 'en-US', 'common.json'), '{ not valid json', 'utf-8');

    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('target 桶损坏 → 中止 prune 并报出该 locale，不静默改名 .bak', async () => {
    const corrupt = path.join(localeDir, 'en-US', 'common.json');
    const proc = new PruneProcessor(buildConfig(), false, undefined, { dryRun: false, ci: true });

    await expect(proc.execute()).rejects.toThrow(/en-US.*解析失败|解析失败.*en-US/);

    // 损坏文件未被改名为 .bak（仍在原处）
    expect(fs.existsSync(corrupt)).toBe(true);
    expect(fs.existsSync(`${corrupt}.bak`)).toBe(false);
  });
});
