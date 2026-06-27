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
 * 回归：csv-import 回流时 key 来自外部 CSV（翻译人员回传），未经过滤。路由用三元
 * `inUntranslated ? untranslated[key] : translated[key]`，其中 else 分支 `translated[key]`
 * 在修复前是无 own-property 守卫的裸读取。当 CSV 含 key=`__proto__`（或 constructor/prototype）时，
 * `translated['__proto__']` 取到 Object.prototype（继承值、真值），绕过 `if (!entry)`，随后
 * `entry[col.name] = value` 写穿原型链 → 全局原型污染。修复：translated 分支同样 hasOwnProperty 守卫。
 */
describe('CsvImportProcessor — __proto__ 原型污染防护', () => {
  let tmpDir: string;
  let localeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-csv-proto-'));
    localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    // 防御性清理：若污染发生，避免泄漏到其他测试。
    delete (Object.prototype as Record<string, unknown>)['en-US'];
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

  it('CSV 含 __proto__ 行不污染 Object.prototype，且按 missing 跳过', async () => {
    fs.writeFileSync(
      path.join(localeDir, 'untranslated.json'),
      JSON.stringify({ a: { 'zh-CN': '甲', 'en-US': '' } }, null, 2),
    );
    const input = path.join(tmpDir, 'evil.csv');
    fs.writeFileSync(
      input,
      serializeCsv([
        ['key', 'zh-CN', 'en-US', 'reason'],
        ['__proto__', '恶意', 'PWNED', ''],
        ['constructor', '恶意', 'PWNED', ''],
        ['a', '甲', 'Jia', ''], // 正常 key 仍应写回
      ]),
    );

    await new CsvImportProcessor(makeConfig(), false, {
      input,
      dryRun: false,
      ci: true,
    }).execute();

    // 关键断言：全局原型未被污染
    expect(({} as Record<string, unknown>)['en-US']).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>)['en-US']).toBeUndefined();

    // 正常 key 仍正确写回，污染行不新建
    const out = JSON.parse(
      fs.readFileSync(path.join(localeDir, 'untranslated.json'), 'utf8'),
    ) as Record<string, Record<string, string>>;
    expect(out.a['en-US']).toBe('Jia');
    // 污染行未作为真实数据 key 写入（用 own-property 判定，避开 __proto__ getter）
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(false);
  });
});
