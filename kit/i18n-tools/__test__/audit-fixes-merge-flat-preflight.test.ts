import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 回归（审计 ②）：扁平模式下损坏 target locale 文件时，merge 必须在写回前 fail-fast 抛错，
 * 不得「先清空 untranslated.json / 写 translations.json、再静默跳过 target 写回」造成
 * CI 伪成功 + 运行时漏译。损坏检测前移到 performMerge 之前的 assertLocalesNotCorrupt。
 */
describe('MergeProcessor — 扁平 target locale 损坏写回前抛错（审计 ②）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-merge-flat-preflight-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
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

  it('损坏 en-US.json → 抛错，且 untranslated.json 未被清空', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    // 一条「全部 target 已翻译」的条目 → 正常会触发 performMerge 清空 untranslated
    const untPath = path.join(localeDir, 'untranslated.json');
    const untContent = JSON.stringify({ 'a.foo': { 'zh-CN': '你好', 'en-US': 'Hello' } }, null, 2);
    fs.writeFileSync(untPath, untContent);
    fs.writeFileSync(path.join(localeDir, 'translations.json'), '{}');

    // 损坏的扁平 target locale
    const enPath = path.join(localeDir, 'en-US.json');
    const corrupt = '{ "x.y": "Z",,, }';
    fs.writeFileSync(enPath, corrupt);

    await expect(new MergeProcessor(makeConfig(), false).execute()).rejects.toThrow(/解析失败/);

    // 关键断言：写回前抛错 → untranslated.json 未被清空、损坏文件原样保留
    expect(fs.readFileSync(untPath, 'utf-8')).toBe(untContent);
    expect(fs.readFileSync(enPath, 'utf-8')).toBe(corrupt);
  });
});
