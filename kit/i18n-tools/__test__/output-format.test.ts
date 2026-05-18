import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LanguageFileManager } from '../src/utils/language-file-manager';
import { ExportProcessor } from '../src/core/ExportProcessor';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-output-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeConfig(overrides: Partial<I18nToolsConfig> = {}): ResolvedConfig {
  const user: I18nToolsConfig = {
    root: tmpDir,
    framework: { type: 'vue' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: {
      localesDir: 'locale',
      sourceDir: 'src',
      include: ['**/*.vue'],
      exclude: [],
      format: 'nested',
    },
    keys: {
      separator: '.',
    },
    llm: { shared: { apiKey: 'x', model: 'm' } },
    ...overrides,
  };
  return resolveConfig(user);
}

describe('io.format=nested 写入', () => {
  it('单文件场景：按 separator 拆分写出嵌套 JSON', () => {
    const config = makeConfig();
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    LanguageFileManager.writeLocaleFile(
      config,
      false,
      { 'order.title': '订单', 'order.list.empty': '空', 'common.confirm': '确认' },
      'zh-CN',
    );

    const file = path.join(config.io.localesDir, 'zh-CN.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      order: {
        title: '订单',
        list: { empty: '空' },
      },
      common: { confirm: '确认' },
    });
  });

  it('单文件场景：format=flat 时保留扁平 key', () => {
    const config = makeConfig({ io: { format: 'flat', localesDir: 'locale' } });
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    LanguageFileManager.writeLocaleFile(
      config,
      false,
      { 'order.title': '订单', 'order.list.empty': '空' },
      'zh-CN',
    );

    const file = path.join(config.io.localesDir, 'zh-CN.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      'order.title': '订单',
      'order.list.empty': '空',
    });
  });

  it('分桶场景：每个 bucket 独立 unflatten', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', matchKey: (k) => k.startsWith('order.') }],
        defaultBucket: 'common',
        emitManifest: false,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    LanguageFileManager.writeLocaleFile(
      config,
      false,
      { 'order.title': '订单', 'order.list.empty': '空', 'misc.foo': '其它' },
      'zh-CN',
      { 'order.title': 'order', 'order.list.empty': 'order', 'misc.foo': 'common' },
    );

    const orderFile = path.join(config.io.localesDir, 'zh-CN', 'order.json');
    const commonFile = path.join(config.io.localesDir, 'zh-CN', 'common.json');
    expect(JSON.parse(fs.readFileSync(orderFile, 'utf-8'))).toEqual({
      order: { title: '订单', list: { empty: '空' } },
    });
    expect(JSON.parse(fs.readFileSync(commonFile, 'utf-8'))).toEqual({
      misc: { foo: '其它' },
    });
  });

  it('增量写入 + 读取往返：嵌套源文件经 flatten 后再 unflatten 仍一致', () => {
    const config = makeConfig();
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    const original = { 'order.title': '订单', 'order.list.empty': '空' };
    LanguageFileManager.writeLocaleFile(config, false, original, 'zh-CN');

    const messages = LanguageFileManager.getMessages(config, false);
    expect(messages['zh-CN']).toEqual(original);

    // 改一个值再写回，验证读—改—写循环
    const zh = messages['zh-CN'] as Record<string, string>;
    zh['order.title'] = '订单 v2';
    LanguageFileManager.writeLocaleFile(config, false, zh, 'zh-CN');

    const file = path.join(config.io.localesDir, 'zh-CN.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      order: {
        title: '订单 v2',
        list: { empty: '空' },
      },
    });
  });

  it('前缀冲突拦截：a.b 与 a.b.c 同时存在时抛错', () => {
    const config = makeConfig();
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    expect(() =>
      LanguageFileManager.writeLocaleFile(
        config,
        false,
        { 'a.b': '叶子', 'a.b.c': '子树' },
        'zh-CN',
      ),
    ).toThrow(/前缀冲突/);
  });

  it('format=flat 时即使存在前缀冲突也不抛错（扁平不做 unflatten）', () => {
    const config = makeConfig({ io: { format: 'flat', localesDir: 'locale' } });
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    expect(() =>
      LanguageFileManager.writeLocaleFile(
        config,
        false,
        { 'a.b': '叶子', 'a.b.c': '子树' },
        'zh-CN',
      ),
    ).not.toThrow();
  });
});

describe('ExportProcessor 在 exportDir 未配置时的行为', () => {
  it('未配置 io.exportDir 时调用 execute() 抛错', async () => {
    const config = makeConfig({ io: { format: 'flat', localesDir: 'locale' } });
    fs.mkdirSync(config.io.localesDir, { recursive: true });
    fs.writeFileSync(path.join(config.io.localesDir, 'zh-CN.json'), '{"a":"x"}');
    fs.writeFileSync(path.join(config.io.localesDir, 'en-US.json'), '{"a":"X"}');

    const processor = new ExportProcessor(config);
    await expect(processor.execute()).rejects.toThrow(/io\.exportDir/);
  });

  it('显式传 outputDir 时可绕过 exportDir 缺省并写出 nested 产物', async () => {
    const config = makeConfig();
    fs.mkdirSync(config.io.localesDir, { recursive: true });
    fs.writeFileSync(
      path.join(config.io.localesDir, 'zh-CN.json'),
      JSON.stringify({ order: { title: '订单' } }),
    );
    fs.writeFileSync(
      path.join(config.io.localesDir, 'en-US.json'),
      JSON.stringify({ order: { title: 'Order' } }),
    );

    const outputDir = path.join(tmpDir, 'public-locale');
    await new ExportProcessor(config).execute(outputDir);

    expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'zh-CN.json'), 'utf-8'))).toEqual({
      order: { title: '订单' },
    });
  });
});
