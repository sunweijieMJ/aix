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
 * 回归（Bug B6）：translate「全部批次失败」时必须以抛错（非零退出）结束，
 * 与 restore（failedFiles>0 抛错）/ doctor（CI error>0 抛错）口径对齐，
 * 否则 CI 会把「所有翻译都失败」误判为成功。
 *
 * 同时保留「断点续翻」设计：部分批次失败（仍有成功）不抛错，留待重跑续翻。
 */
describe('TranslateProcessor — 全失败应非零退出（Bug B6）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-translate-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeConfig(batchSize = 30): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' }, translation: { batchSize } },
    };
    return resolveConfig(user);
  }

  /** 写出 untranslated.json，返回路径。 */
  function writeUntranslated(entries: Translations): string {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    const p = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(p, JSON.stringify(entries, null, 2));
    return p;
  }

  it('全部批次失败（LLM 全返回 null）→ 抛错中止', async () => {
    writeUntranslated({
      'a.b': { 'zh-CN': '你好', 'en-US': '' },
      'a.c': { 'zh-CN': '世界', 'en-US': '' },
    });
    // 所有批次返回 undefined → 全失败（performBatchTranslation 用 !translatedBatch 判失败）
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) => batches.map(() => undefined),
    );

    const processor = new TranslateProcessor(makeConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/全部|失败/);
  });

  it('全部批次成功 → 正常完成不抛错', async () => {
    writeUntranslated({ 'a.b': { 'zh-CN': '你好', 'en-US': '' } });
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const key of Object.keys(b)) out[key] = { 'en-US': 'Hello' };
          return out;
        }),
    );

    const processor = new TranslateProcessor(makeConfig(), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });

  it('部分批次失败（仍有成功）→ 不抛错，保留断点续翻设计', async () => {
    writeUntranslated({
      'a.b': { 'zh-CN': '你好', 'en-US': '' },
      'a.c': { 'zh-CN': '世界', 'en-US': '' },
    });
    // batchSize=1 → 2 个批次：第一个成功，第二个失败
    let n = 0;
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b): Translations | undefined => {
          if (n++ === 0) {
            const out: Translations = {};
            for (const key of Object.keys(b)) out[key] = { 'en-US': 'OK' };
            return out;
          }
          return undefined;
        }),
    );

    const processor = new TranslateProcessor(makeConfig(1), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });
});
