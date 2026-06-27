import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CsvImportProcessor } from '../src/core/CsvImportProcessor';
import { serializeCsv } from '../src/utils/csv-utils';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 回归（审计 ⑦）：csv-import 命中的字典条目若为非对象（手工破坏 schema，如某 key 值是字符串），
 * `!entry` 拦不住真值非对象，旧实现 `entry[col.name] = value` 在严格模式抛 TypeError 崩溃整个回流。
 * 修复：补 `typeof entry !== 'object'` 守卫，并入 missingKeys 跳过，不崩溃、不写坏数据。
 */
describe('CsvImportProcessor — 非对象字典条目守卫（审计 ⑦）', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-nonobj-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
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

  it('字典某 key 值为字符串（非对象）时不崩溃，按 missing 跳过', async () => {
    // 合法 JSON、但 'a' 的值是字符串而非 {locale: value} 对象（手工破坏 schema）
    const untPath = path.join(localeDir, 'untranslated.json');
    const untContent = JSON.stringify({ a: 'oops-a-string' });
    fs.writeFileSync(untPath, untContent);

    const input = path.join(tmpDir, 'in.csv');
    fs.writeFileSync(
      input,
      serializeCsv([
        ['key', 'zh-CN', 'en-US', 'reason'],
        ['a', '甲', 'Jia', ''],
      ]),
    );

    // 不抛 TypeError
    await expect(
      new CsvImportProcessor(makeConfig(), false, { input, dryRun: false, ci: true }).execute(),
    ).resolves.toBeUndefined();

    // 破坏的字典未被写穿（非对象 entry 未被赋值）
    expect(JSON.parse(fs.readFileSync(untPath, 'utf-8'))).toEqual({ a: 'oops-a-string' });
  });
});
