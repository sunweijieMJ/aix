import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PickProcessor } from '../src/core/PickProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 回归（审计 Med）：pick 的损坏防护必须覆盖所有 target，而不只是 source。
 *
 * 根因（修复前）：守卫只对 sourceLocale 探测损坏，但 getMessages 走 safeLoadJsonFile(silent)
 * 把损坏的 target 静默当成 {} → analyzeTranslationStatus 里该 target 每个 key 读成 undefined
 * → 全判未翻译 → saveFiles 无条件覆写 untranslated.json（销毁尚未 merge 的在途译文）并伪报成功。
 *
 * 修复：守卫循环 [source, ...targets]，与 MergeProcessor.assertLocalesNotCorrupt 对齐。
 */
describe('PickProcessor — target locale 损坏保护', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-pick-target-corrupt-'));
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

  it('target locale 损坏时抛错中止，且不覆写 untranslated.json 在途数据 / 不伪报成功', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    // source 有效，target（en-US）损坏（尾逗号）
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ 'a.b': '你好' }));
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), '{ "a.b": "Hi",, }');

    // untranslated.json 里有「尚未 merge」的在途译文
    const inFlight = JSON.stringify(
      { 'a.b': { 'zh-CN': '你好', 'en-US': 'Hello(in-flight)' } },
      null,
      2,
    );
    const untPath = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(untPath, inFlight);

    const processor = new PickProcessor(makeConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON/);

    // 关键：在途数据原样保留，未被覆写；未伪报成功
    expect(fs.readFileSync(untPath, 'utf-8')).toBe(inFlight);
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('source 与所有 target 均有效时正常完成', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ 'a.b': '你好' }));
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({ 'a.b': 'Hi' }));

    const processor = new PickProcessor(makeConfig(), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });
});
