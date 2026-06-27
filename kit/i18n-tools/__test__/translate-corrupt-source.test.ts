import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TranslateProcessor } from '../src/core/TranslateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归（审查 #5）：translate 此前用 safeLoadJsonFile 读 untranslated.json，它对解析失败
 * 回退 {} → totalCount===0 → 打印「文件为空，无需处理」→ exit 0 伪报成功。CI 会把一份
 * 损坏的待翻译文件误判为「已全部翻译」绿灯通过。与 Merge/Pick/Export 的「损坏即中止」对齐：
 * 有内容却解析失败时抛错中止。
 */
describe('TranslateProcessor — 损坏 untranslated.json 守卫（#5）', () => {
  let rootDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: path.join(rootDir, 'src'), localesDir: localeDir, format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-corrupt-'));
    localeDir = path.join(rootDir, 'locale');
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

  it('损坏 untranslated.json → 抛错中止，不伪报「文件为空」', async () => {
    const untPath = path.join(localeDir, 'untranslated.json');
    const corrupt = '{ "a.b": { "zh-CN": "你好", "en-US": "" },, }';
    fs.writeFileSync(untPath, corrupt, 'utf-8');

    await expect(new TranslateProcessor(buildConfig()).execute()).rejects.toThrow(/解析失败|JSON/);

    // 关键：不把损坏当空文件 → 不应打印「文件为空」式的伪成功提示，损坏文件原样保留
    expect(LoggerUtils.warn).not.toHaveBeenCalledWith(expect.stringContaining('文件为空'));
    expect(fs.readFileSync(untPath, 'utf-8')).toBe(corrupt);
  });

  it('空 untranslated.json → 仍按空处理，不抛错', async () => {
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), '', 'utf-8');
    await expect(new TranslateProcessor(buildConfig()).execute()).resolves.toBeUndefined();
  });
});
