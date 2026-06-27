import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RestoreProcessor } from '../src/core/RestoreProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 回归 #5：restore 对「损坏的 source locale」必须中止报错，绝不把损坏当成「空」而静默 no-op
 * 并打印成功（exit 0）。
 *
 * 旧实现 loadLocaleMap 做 `readLocaleFile(...) ?? {}`，把「解析失败(null)」与「真正为空」混为一谈
 * → 下游 length===0 分支 warn+return → 源码原封未动却伪报成功。须与 pick/merge/prune 的
 * corrupt-abort 守卫对齐。
 */
describe('RestoreProcessor — 源 locale 损坏保护（回归 #5）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-restore-corrupt-'));
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeConfig(buckets = false): ResolvedConfig {
    const user: I18nToolsConfig = {
      root: tmpDir,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
      ...(buckets
        ? {
            buckets: {
              rules: [{ name: 'order', matchKey: (key: string) => key.startsWith('order.') }],
            },
          }
        : {}),
    };
    return resolveConfig(user);
  }

  it('单文件 source 损坏 → 抛错中止，不伪报成功', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{ "a.b": "你好",, }');

    const processor = new RestoreProcessor(makeConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON/);
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('[桶式] source bucket 损坏 → 抛错中止', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    const zhDir = path.join(localeDir, 'zh-CN');
    fs.mkdirSync(zhDir, { recursive: true });
    fs.writeFileSync(path.join(zhDir, 'order.json'), '{ "order.foo": "你好",, }');

    const processor = new RestoreProcessor(makeConfig(true), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON|损坏/);
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('source 真正为空 → 不抛错（warn 后 no-op，空属合法成功）', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{}');

    const processor = new RestoreProcessor(makeConfig(), false);
    // 空 source 是合法 no-op（与「损坏」区分）：不抛错；lifecycle 打印成功属正常。
    await expect(processor.execute()).resolves.toBeUndefined();
    expect(LoggerUtils.warn).toHaveBeenCalledWith('语言文件为空，无可还原条目');
  });
});
