import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LanguageFileManager } from '../src/utils/language-file-manager';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig } from '../src/config/types';

/**
 * 回归（#12）：读路径的 flattenObject 必须使用 config.keys.separator。
 *
 * 根因（修复前）：getMessages / migrateToBuckets / readBucketedLocaleWithBucketMap 调用
 * flattenObject(data) 用默认分隔符 '.'，而 readLocaleFile / readBucketedLocaleFlat 传了
 * config.keys.separator。flat 格式 + 非 '.' 分隔符 + 磁盘是嵌套 JSON 时，两族读路径得到
 * 不同 flat key 集（a/b vs a.b），令 prune/merge 误判孤儿。
 */
describe('flattenObject 读路径使用 keys.separator', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'flatten-sep-'));
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('getMessages 用配置的非 "." 分隔符展平嵌套 JSON', () => {
    const localeDir = path.join(root, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    // 磁盘是嵌套 JSON；flat 格式 + 分隔符 '/'
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ a: { b: '你好' } }));

    const config = resolveConfig({
      root,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN' },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '/' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } as I18nToolsConfig);

    const msgs = LanguageFileManager.getMessages(config, false);
    // 修复前会得到 'a.b'（默认分隔符），与 readLocaleFile('/') 的 key 集不一致
    expect(Object.keys(msgs['zh-CN']!)).toEqual(['a/b']);
    expect(msgs['zh-CN']!['a/b']).toBe('你好');
  });

  it('与 readLocaleFile 的 key 集一致（往返安全路径同源）', () => {
    const localeDir = path.join(root, 'locale');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(
      path.join(localeDir, 'zh-CN.json'),
      JSON.stringify({ views: { order: { title: '订单' } } }),
    );
    const config = resolveConfig({
      root,
      framework: { type: 'vue' },
      locales: { source: 'zh-CN' },
      io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
      keys: { separator: '/' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } as I18nToolsConfig);

    const viaGetMessages = Object.keys(LanguageFileManager.getMessages(config, false)['zh-CN']!);
    const viaReadLocale = Object.keys(LanguageFileManager.readLocaleFile(config, false) ?? {});
    expect(viaGetMessages).toEqual(viaReadLocale);
    expect(viaReadLocale).toEqual(['views/order/title']);
  });
});
