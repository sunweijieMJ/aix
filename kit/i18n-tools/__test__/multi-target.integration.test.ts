import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PickProcessor } from '../src/core/PickProcessor';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { ExportProcessor } from '../src/core/ExportProcessor';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 多目标语种集成测试：targets=['en','ja'] 走 pick → merge → export 三步全流程。
 *
 * 不涉及 LLM：translate 阶段需要真实/mock LLMClient，集成测试更适合手动模拟翻译
 * 结果直接落到 untranslated.json，再由 merge 处理（与生产链路一致）。
 */
describe('多目标语种全流程', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-multi-target-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeConfig(overrides: Partial<I18nToolsConfig> = {}): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh', targets: ['en', 'ja'] },
      io: {
        localesDir: 'locale',
        exportDir: 'export',
        sourceDir: 'src',
        format: 'flat',
      },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
      ...overrides,
    };
    return resolveConfig(user);
  }

  it('Pick：source 文件 + 部分 target 已翻译 → 多 target untranslated schema', () => {
    const config = makeConfig();
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    // source：3 个 key
    fs.writeFileSync(
      path.join(localeDir, 'zh.json'),
      JSON.stringify({ a: '你好', b: '再见', c: '谢谢' }),
    );
    // en：a 已翻、b 已翻、c 缺失
    fs.writeFileSync(path.join(localeDir, 'en.json'), JSON.stringify({ a: 'hello', b: 'bye' }));
    // ja：a 已翻、b 缺失、c 已翻
    fs.writeFileSync(
      path.join(localeDir, 'ja.json'),
      JSON.stringify({ a: 'こんにちは', c: 'ありがとう' }),
    );

    new PickProcessor(config).execute();

    const untranslated = JSON.parse(
      fs.readFileSync(path.join(localeDir, 'untranslated.json'), 'utf-8'),
    );
    const translated = JSON.parse(
      fs.readFileSync(path.join(localeDir, 'translations.json'), 'utf-8'),
    );

    // a 在 en/ja 都翻译完成 → translations.json
    expect(translated.a).toEqual({ zh: '你好', en: 'hello', ja: 'こんにちは' });

    // b 在 en 已翻，ja 缺失 → untranslated.json（含完整 schema）
    expect(untranslated.b).toEqual({ zh: '再见', en: 'bye', ja: '' });

    // c 在 ja 已翻，en 缺失 → untranslated.json
    expect(untranslated.c).toEqual({ zh: '谢谢', en: '', ja: 'ありがとう' });
  });

  it('Merge：所有 target 完成的 key 进 translations，部分完成的留在 untranslated', () => {
    const config = makeConfig();
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    // 模拟 translate 阶段后的 untranslated：b 两种语言都补全、c 仍缺 en
    const untranslatedData = {
      b: { zh: '再见', en: 'bye', ja: 'さようなら' },
      c: { zh: '谢谢', en: '', ja: 'ありがとう' },
    };
    fs.writeFileSync(path.join(localeDir, 'untranslated.json'), JSON.stringify(untranslatedData));
    fs.writeFileSync(path.join(localeDir, 'translations.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(localeDir, 'zh.json'), JSON.stringify({ b: '再见', c: '谢谢' }));
    fs.writeFileSync(path.join(localeDir, 'en.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(localeDir, 'ja.json'), JSON.stringify({}));

    new MergeProcessor(config).execute();

    const translations = JSON.parse(
      fs.readFileSync(path.join(localeDir, 'translations.json'), 'utf-8'),
    );
    const stillUntranslated = JSON.parse(
      fs.readFileSync(path.join(localeDir, 'untranslated.json'), 'utf-8'),
    );

    // b 两种 target 都补全 → 进 translations
    expect(translations.b).toMatchObject({ zh: '再见', en: 'bye', ja: 'さようなら' });
    // c 缺 en → 仍留 untranslated
    expect(stillUntranslated.c).toMatchObject({ zh: '谢谢', en: '', ja: 'ありがとう' });

    // 目标语言文件被同步更新（仅 b 的两个 target）
    const enFile = JSON.parse(fs.readFileSync(path.join(localeDir, 'en.json'), 'utf-8'));
    const jaFile = JSON.parse(fs.readFileSync(path.join(localeDir, 'ja.json'), 'utf-8'));
    expect(enFile.b).toBe('bye');
    expect(jaFile.b).toBe('さようなら');
    // c 缺 en，所以 en.json 不应被填入 c
    expect(enFile.c).toBeUndefined();
    // c 在 ja 已翻——但因 c 整体没全部完成，merge 不同步该 key 到 ja.json
    expect(jaFile.c).toBeUndefined();
  });

  it('Export：source + 全部 targets 同时输出', async () => {
    const config = makeConfig();
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh.json'), JSON.stringify({ a: '你好' }));
    fs.writeFileSync(path.join(localeDir, 'en.json'), JSON.stringify({ a: 'hello' }));
    fs.writeFileSync(path.join(localeDir, 'ja.json'), JSON.stringify({ a: 'こんにちは' }));

    await new ExportProcessor(config).execute();

    const exportDir = path.join(tmpDir, 'export');
    expect(fs.existsSync(path.join(exportDir, 'zh.json'))).toBe(true);
    expect(fs.existsSync(path.join(exportDir, 'en.json'))).toBe(true);
    expect(fs.existsSync(path.join(exportDir, 'ja.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(exportDir, 'ja.json'), 'utf-8'))).toEqual({
      a: 'こんにちは',
    });
  });

  it('Glossary：词表对每个 target 独立 lookup（完整版 {[locale]: value}）', () => {
    const glossaryPath = path.join(tmpDir, 'glossary.json');
    fs.writeFileSync(
      glossaryPath,
      JSON.stringify({
        提交: { en: 'Submit', ja: '送信' },
      }),
    );

    const config = makeConfig({
      glossary: { file: 'glossary.json' },
    });
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh.json'), JSON.stringify({ k: '提交' }));
    fs.writeFileSync(path.join(localeDir, 'en.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(localeDir, 'ja.json'), JSON.stringify({}));

    new PickProcessor(config).execute();

    const translations = JSON.parse(
      fs.readFileSync(path.join(localeDir, 'translations.json'), 'utf-8'),
    );
    // 词表命中：k 两个 target 都被填入
    expect(translations.k).toEqual({ zh: '提交', en: 'Submit', ja: '送信' });
  });

  it('locales.targets 数组顺序影响输出顺序（不影响内容）', () => {
    const config = makeConfig({
      locales: { source: 'zh', targets: ['ja', 'en'] },
    });
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh.json'), JSON.stringify({ a: '你好' }));

    new PickProcessor(config).execute();

    const untranslated = JSON.parse(
      fs.readFileSync(path.join(localeDir, 'untranslated.json'), 'utf-8'),
    );
    // 内容应包含两个 target
    expect(untranslated.a).toHaveProperty('en');
    expect(untranslated.a).toHaveProperty('ja');
    expect(untranslated.a).toHaveProperty('zh');
  });
});
