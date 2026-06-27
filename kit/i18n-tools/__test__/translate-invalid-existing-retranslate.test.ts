import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TranslateProcessor } from '../src/core/TranslateProcessor';
import { LLMClient } from '../src/utils/llm-client';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';
import type { Translations } from '../src/utils/types';

/**
 * 回归：translate 原用 `item[target]?.trim()` 判定是否已译，与 pick/merge 的 isValidTranslation
 * 口径不一致。当目标值是「非空但无效」（纯标点/符号，如 '——'）时，trim() 为真 → translate 误当
 * 已译跳过，该条目永远不会被翻译。修复：translate 侧统一改用 isValidTranslation。
 */
describe('TranslateProcessor — 无效占位译文应被重新翻译', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-invalid-existing-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const makeConfig = (): ResolvedConfig =>
    resolveConfig({
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } as I18nToolsConfig);

  const writeUntranslated = (entries: Translations): void => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), JSON.stringify(entries, null, 2));
  };
  const readUntranslated = (): Translations =>
    JSON.parse(fs.readFileSync(path.join(tmpDir, 'locale', 'untranslated.json'), 'utf-8'));

  it('目标值为纯标点（——）→ 仍进入翻译并写回译文', async () => {
    writeUntranslated({ 'a.b': { 'zh-CN': '确认', 'en-US': '——' } });

    const spy = vi
      .spyOn(LLMClient.prototype, 'batchTranslate')
      .mockImplementation(async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) out[k] = { 'en-US': 'Confirm' };
          return out;
        }),
      );

    await expect(new TranslateProcessor(makeConfig(), false).execute()).resolves.toBeUndefined();
    // 关键：无效占位值被识别为未翻译，进入 LLM 并写回真实译文
    expect(spy).toHaveBeenCalled();
    expect(readUntranslated()['a.b']!['en-US']).toBe('Confirm');
  });

  it('目标值为有效译文 → 跳过翻译（无回归）', async () => {
    writeUntranslated({ 'a.b': { 'zh-CN': '确认', 'en-US': 'Confirm' } });

    const spy = vi
      .spyOn(LLMClient.prototype, 'batchTranslate')
      .mockImplementation(async (batches: Translations[]) => batches.map(() => ({})));

    await new TranslateProcessor(makeConfig(), false).execute();
    expect(spy).not.toHaveBeenCalled();
    expect(readUntranslated()['a.b']!['en-US']).toBe('Confirm');
  });
});
