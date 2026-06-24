import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileUtils } from '../src/utils/file-utils';
import { PickProcessor } from '../src/core/PickProcessor';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 回归：translations.json / untranslated.json 落盘必须按 key 字母序，
 * 使顺序与「哪个步骤最后写」解耦。否则 pick（源序）与 merge（已有 + 末尾追加）
 * 顺序不一致，跑一次 pick 就把 merge 追加的 key 重排回中部，产生大 no-op diff。
 */
describe('translations/untranslated 落盘按 key 排序', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-order-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeConfig(): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh', targets: ['en'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    };
    return resolveConfig(user);
  }

  it('FileUtils.writeTranslationsFile：顶层 key 字母序，内层值对象顺序不变', () => {
    const p = path.join(tmpDir, 't.json');
    FileUtils.writeTranslationsFile(p, {
      'm.x': { zh: '乙', en: 'B' },
      'a.x': { zh: '甲', en: 'A' },
    });
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(Object.keys(parsed)).toEqual(['a.x', 'm.x']);
    expect(Object.keys(parsed['a.x'])).toEqual(['zh', 'en']); // 内层不被打乱
  });

  it('pick 写出的 translations.json 按 key 排序（与源文件输入顺序无关）', async () => {
    fs.writeFileSync(
      path.join(localeDir, 'zh.json'),
      JSON.stringify({ 'm.x': '乙', 'a.x': '甲', 'c.x': '丙' }),
    );
    fs.writeFileSync(
      path.join(localeDir, 'en.json'),
      JSON.stringify({ 'm.x': 'B', 'a.x': 'A', 'c.x': 'C' }),
    );

    await new PickProcessor(makeConfig(), false).execute();

    const trans = JSON.parse(fs.readFileSync(path.join(localeDir, 'translations.json'), 'utf8'));
    expect(Object.keys(trans)).toEqual(['a.x', 'c.x', 'm.x']);
  });

  it('merge 写回的 translations.json 按 key 排序（新 key 不再追加到末尾）', async () => {
    // 已有翻译故意乱序；untranslated 有一个已填好待晋升的 key（排序后应落在中间）
    fs.writeFileSync(
      path.join(localeDir, 'translations.json'),
      JSON.stringify({ 'm.x': { zh: '乙', en: 'B' }, 'a.x': { zh: '甲', en: 'A' } }),
    );
    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify({ 'f.x': { zh: '丙', en: 'F' } }),
    );

    await new MergeProcessor(makeConfig(), false).execute();

    const trans = JSON.parse(fs.readFileSync(path.join(localeDir, 'translations.json'), 'utf8'));
    // 旧行为 [m.x, a.x, f.x]（existing + append）；修复后排序 [a.x, f.x, m.x]
    expect(Object.keys(trans)).toEqual(['a.x', 'f.x', 'm.x']);
  });
});
