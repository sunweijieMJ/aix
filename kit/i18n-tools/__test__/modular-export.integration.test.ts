import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LanguageFileManager } from '../src/utils/language-file-manager';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-modular-'));
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
      exportDir: 'export',
      sourceDir: 'src',
      include: ['**/*.vue'],
      exclude: [],
      format: 'flat',
    },
    keys: { separator: '__' },
    llm: { shared: { apiKey: 'x', model: 'm' } },
    ...overrides,
  };
  return resolveConfig(user);
}

describe('LanguageFileManager bucket write', () => {
  it('未配置 buckets 时写单文件（向后兼容）', () => {
    const config = makeConfig();
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    LanguageFileManager.writeLocaleFile(config, false, { 'order.title': '订单' }, 'zh-CN');

    const singleFile = path.join(config.io.localesDir, 'zh-CN.json');
    expect(fs.existsSync(singleFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(singleFile, 'utf-8'))).toEqual({
      'order.title': '订单',
    });
  });

  it('配置 buckets 时按桶分组写入', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    LanguageFileManager.writeLocaleFile(
      config,
      false,
      { 'order.title': '订单', 'user.name': '用户' },
      'zh-CN',
      { 'order.title': 'order', 'user.name': 'common' },
    );

    const orderFile = path.join(config.io.localesDir, 'zh-CN', 'order.json');
    const commonFile = path.join(config.io.localesDir, 'zh-CN', 'common.json');
    expect(JSON.parse(fs.readFileSync(orderFile, 'utf-8'))).toEqual({ 'order.title': '订单' });
    expect(JSON.parse(fs.readFileSync(commonFile, 'utf-8'))).toEqual({ 'user.name': '用户' });
  });

  it('启用分桶时自动从单文件迁移并备份', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.io.localesDir, { recursive: true });
    fs.writeFileSync(
      path.join(config.io.localesDir, 'zh-CN.json'),
      JSON.stringify({ 'legacy.key': '历史' }),
    );

    LanguageFileManager.getMessages(config, false);

    expect(fs.existsSync(path.join(config.io.localesDir, 'zh-CN.json.bak'))).toBe(true);
    expect(fs.existsSync(path.join(config.io.localesDir, 'zh-CN.json'))).toBe(false);
    const migrated = JSON.parse(
      fs.readFileSync(path.join(config.io.localesDir, 'zh-CN', 'common.json'), 'utf-8'),
    );
    expect(migrated).toEqual({ 'legacy.key': '历史' });
  });

  it('迁移是幂等的（第二次运行不再创建 .bak）', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.io.localesDir, { recursive: true });
    fs.writeFileSync(path.join(config.io.localesDir, 'zh-CN.json'), '{"k":"v"}');

    LanguageFileManager.getMessages(config, false);
    const firstBakStat = fs.statSync(path.join(config.io.localesDir, 'zh-CN.json.bak'));

    LanguageFileManager.getMessages(config, false);
    const secondBakStat = fs.statSync(path.join(config.io.localesDir, 'zh-CN.json.bak'));
    expect(secondBakStat.mtimeMs).toBe(firstBakStat.mtimeMs);
  });

  it('getMessages 启用分桶时合并目录下所有 json', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-locale',
      },
    });
    const langDir = path.join(config.io.localesDir, 'zh-CN');
    fs.mkdirSync(langDir, { recursive: true });
    fs.writeFileSync(path.join(langDir, 'order.json'), '{"order.title":"订单"}');
    fs.writeFileSync(path.join(langDir, 'common.json'), '{"common.confirm":"确认"}');

    const messages = LanguageFileManager.getMessages(config, false);
    expect(messages['zh-CN']).toEqual({
      'order.title': '订单',
      'common.confirm': '确认',
    });
  });

  it('layout=by-bucket 时按 <bucket>/<locale>.json 写入', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-bucket',
      },
    });
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    LanguageFileManager.writeLocaleFile(
      config,
      false,
      { 'order.title': '订单', 'user.name': '用户' },
      'zh-CN',
      { 'order.title': 'order', 'user.name': 'common' },
    );

    const orderFile = path.join(config.io.localesDir, 'order', 'zh-CN.json');
    const commonFile = path.join(config.io.localesDir, 'common', 'zh-CN.json');
    expect(JSON.parse(fs.readFileSync(orderFile, 'utf-8'))).toEqual({ 'order.title': '订单' });
    expect(JSON.parse(fs.readFileSync(commonFile, 'utf-8'))).toEqual({ 'user.name': '用户' });
  });

  it('layout=by-bucket 时 getMessages 正确读取', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-bucket',
      },
    });
    const orderDir = path.join(config.io.localesDir, 'order');
    const commonDir = path.join(config.io.localesDir, 'common');
    fs.mkdirSync(orderDir, { recursive: true });
    fs.mkdirSync(commonDir, { recursive: true });
    fs.writeFileSync(path.join(orderDir, 'zh-CN.json'), '{"order.title":"订单"}');
    fs.writeFileSync(path.join(orderDir, 'en-US.json'), '{"order.title":"Order"}');
    fs.writeFileSync(path.join(commonDir, 'zh-CN.json'), '{"common.confirm":"确认"}');
    fs.writeFileSync(path.join(commonDir, 'en-US.json'), '{"common.confirm":"Confirm"}');

    const messages = LanguageFileManager.getMessages(config, false);
    expect(messages['zh-CN']).toEqual({
      'order.title': '订单',
      'common.confirm': '确认',
    });
    expect(messages['en-US']).toEqual({
      'order.title': 'Order',
      'common.confirm': 'Confirm',
    });
  });

  it('matchKey 规则按 key 字面匹配分桶（buildKeyBucketMap 全链路）', () => {
    const config = makeConfig({
      buckets: {
        rules: [
          { name: 'order', matchKey: (key) => key.startsWith('order.') },
          { name: 'user', matchKey: (key) => key === 'user.name' || key === 'user.email' },
        ],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    const localeMap = { 'order.title': '订单', 'user.name': '用户', 'misc.foo': '其它' };
    const keyBucketMap = LanguageFileManager.buildKeyBucketMap(config, localeMap);

    expect(keyBucketMap).toEqual({
      'order.title': 'order',
      'user.name': 'user',
      'misc.foo': 'common',
    });

    LanguageFileManager.writeLocaleFile(config, false, localeMap, 'zh-CN', keyBucketMap);

    const orderFile = path.join(config.io.localesDir, 'zh-CN', 'order.json');
    const userFile = path.join(config.io.localesDir, 'zh-CN', 'user.json');
    const commonFile = path.join(config.io.localesDir, 'zh-CN', 'common.json');
    expect(JSON.parse(fs.readFileSync(orderFile, 'utf-8'))).toEqual({ 'order.title': '订单' });
    expect(JSON.parse(fs.readFileSync(userFile, 'utf-8'))).toEqual({ 'user.name': '用户' });
    expect(JSON.parse(fs.readFileSync(commonFile, 'utf-8'))).toEqual({ 'misc.foo': '其它' });
  });

  it('所有 key 都未命中规则时全部落入 defaultBucket', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', matchKey: (key) => key.startsWith('order.') }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.io.localesDir, { recursive: true });

    LanguageFileManager.writeLocaleFile(config, false, { 'a.x': 'A', 'b.y': 'B' }, 'zh-CN', {
      'a.x': 'common',
      'b.y': 'common',
    });

    const commonFile = path.join(config.io.localesDir, 'zh-CN', 'common.json');
    expect(JSON.parse(fs.readFileSync(commonFile, 'utf-8'))).toEqual({ 'a.x': 'A', 'b.y': 'B' });
    expect(fs.existsSync(path.join(config.io.localesDir, 'zh-CN', 'order.json'))).toBe(false);
  });
});
