import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PickProcessor } from '../src/core/PickProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 回归（Bug B5）：pick 阶段对「损坏的 source locale」必须中止，绝不在内容未知时
 * 把 untranslated.json / translations.json 覆写成 {} 并伪报成功。
 *
 * 旧实现走 getMessages → safeLoadJsonFile(silent) → 损坏当成 {} → sourceMessages 为空
 * → 无条件写出两个空字典 → 销毁 untranslated.json 里 translate 写入、尚未 merge 的在途译文，
 *   且打印 "✅ 成功" 掩盖 source 已损坏。须与 merge/prune 的 corrupt-abort 守卫对齐。
 */
describe('PickProcessor — 源 locale 损坏保护（Bug B5）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-pick-corrupt-'));
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

  it('source locale 损坏时抛错中止，且不覆写 untranslated.json 在途数据', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    // 损坏的 source（尾逗号）
    const corruptSource = '{ "a.b": "你好",, }';
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), corruptSource);
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), '{}');

    // untranslated.json 里有「translate 写入、尚未 merge」的在途译文
    const inFlight = JSON.stringify(
      { 'a.b': { 'zh-CN': '你好', 'en-US': 'Hello(in-flight)' } },
      null,
      2,
    );
    const untPath = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(untPath, inFlight);

    const processor = new PickProcessor(makeConfig(), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON/);

    // 关键断言：在途数据原样保留，未被覆写成 {}
    expect(fs.readFileSync(untPath, 'utf-8')).toBe(inFlight);
    // 不应伪报成功
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('[桶式] source 某 bucket 损坏时也抛错中止，不覆写在途数据', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    // by-locale 布局：<localeDir>/<locale>/<bucket>.json，写一个损坏的 source(zh-CN) bucket
    const zhDir = path.join(localeDir, 'zh-CN');
    fs.mkdirSync(zhDir, { recursive: true });
    fs.writeFileSync(path.join(zhDir, 'order.json'), '{ "order.foo": "你好",, }');

    const inFlight = JSON.stringify(
      { 'order.foo': { 'zh-CN': '你好', 'en-US': 'Hello(in-flight)' } },
      null,
      2,
    );
    const untPath = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(untPath, inFlight);

    const processor = new PickProcessor(makeConfig(true), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON|损坏/);

    expect(fs.readFileSync(untPath, 'utf-8')).toBe(inFlight);
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('[桶式] 尚未迁移的遗留单文件损坏时也抛错中止，不清空在途数据（#6）', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });

    // 桶目录尚不存在（首次启用 buckets），仅有损坏的遗留单文件 zh-CN.json：
    // 旧行为 → getMessages 触发 migrateToBuckets silent 读 → 当 {} → rename .bak → 清空在途译文。
    const legacy = path.join(localeDir, 'zh-CN.json');
    fs.writeFileSync(legacy, '{ "order.foo": "你好",, }', 'utf-8');

    const inFlight = JSON.stringify(
      { 'order.foo': { 'zh-CN': '你好', 'en-US': 'Hello(in-flight)' } },
      null,
      2,
    );
    const untPath = path.join(localeDir, 'untranslated.json');
    fs.writeFileSync(untPath, inFlight);

    const processor = new PickProcessor(makeConfig(true), false);
    await expect(processor.execute()).rejects.toThrow(/解析失败|JSON|损坏/);

    expect(fs.readFileSync(untPath, 'utf-8')).toBe(inFlight);
    expect(fs.existsSync(`${legacy}.bak`)).toBe(false);
    expect(LoggerUtils.success).not.toHaveBeenCalled();
  });

  it('source locale 不存在（空目录）时按空处理，不抛错', async () => {
    const localeDir = path.join(tmpDir, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), '{}');
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), '{}');

    const processor = new PickProcessor(makeConfig(), false);
    await expect(processor.execute()).resolves.toBeUndefined();
  });
});
