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
 * 回归（#11）：LLM 返回结构合法、但所有条目因占位符不一致被丢弃（0 条写入）的批次，
 * 必须计为失败并进入退出守卫——否则全批/全 target 如此时进程会 exit 0 却什么都没写，
 * CI 把「翻译跑了一条没落」误判为成功。
 */
describe('TranslateProcessor — 占位符全丢批次计为失败（#11）', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-drop-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const makeConfig = (batchSize = 30): ResolvedConfig =>
    resolveConfig({
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' }, translation: { batchSize } },
    } as I18nToolsConfig);

  const writeUntranslated = (entries: Translations): void => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), JSON.stringify(entries, null, 2));
  };

  it('占位符不一致致整批丢弃（0 条写入）→ 抛错，不静默 exit 0', async () => {
    writeUntranslated({ 'a.b': { 'zh-CN': '共 {count} 个', 'en-US': '' } });
    // 译文把 {count} 写成 {counts} → mergeTranslations 占位符校验丢弃 → translated===0
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) out[k] = { 'en-US': 'Total {counts} items' };
          return out;
        }),
    );

    const processor = new TranslateProcessor(makeConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/失败|未产出/);
  });

  it('同批内部分丢弃但仍有成功 → 不抛错（保留断点续翻）', async () => {
    writeUntranslated({
      'a.b': { 'zh-CN': '共 {count} 个', 'en-US': '' }, // 将被丢弃
      'a.c': { 'zh-CN': '你好', 'en-US': '' }, // 正常翻译
    });
    vi.spyOn(LLMClient.prototype, 'batchTranslate').mockImplementation(
      async (batches: Translations[]) =>
        batches.map((b) => {
          const out: Translations = {};
          for (const k of Object.keys(b)) {
            out[k] = k === 'a.b' ? { 'en-US': 'X {counts}' } : { 'en-US': 'Hello' };
          }
          return out;
        }),
    );

    const processor = new TranslateProcessor(makeConfig(), false); // 单批：translated===1>0 → 成功
    await expect(processor.execute()).resolves.toBeUndefined();
  });
});
