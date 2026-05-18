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

  it('规则变更后重写：旧 bucket 文件被重命名为 .bak（孤儿清理）', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', matchKey: (key) => key.startsWith('order.') }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-locale',
      },
    });
    const langDir = path.join(config.io.localesDir, 'zh-CN');
    fs.mkdirSync(langDir, { recursive: true });

    // 模拟历史规则：把 user.* 写到 user.json
    LanguageFileManager.writeLocaleFile(
      config,
      false,
      { 'user.name': '用户', 'order.title': '订单' },
      'zh-CN',
      { 'user.name': 'user', 'order.title': 'order' },
    );
    expect(fs.existsSync(path.join(langDir, 'user.json'))).toBe(true);

    // 新规则只保留 order；user.* 现在归入 common
    LanguageFileManager.writeLocaleFile(
      config,
      false,
      { 'user.name': '用户', 'order.title': '订单' },
      'zh-CN',
      { 'user.name': 'common', 'order.title': 'order' },
    );

    expect(fs.existsSync(path.join(langDir, 'user.json'))).toBe(false);
    expect(fs.existsSync(path.join(langDir, 'user.json.bak'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(langDir, 'common.json'), 'utf-8'))).toEqual({
      'user.name': '用户',
    });
    expect(JSON.parse(fs.readFileSync(path.join(langDir, 'order.json'), 'utf-8'))).toEqual({
      'order.title': '订单',
    });
  });

  it('孤儿清理是幂等的：第二次 .bak 不会被覆盖', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', matchKey: (key) => key.startsWith('order.') }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-locale',
      },
    });
    const langDir = path.join(config.io.localesDir, 'zh-CN');
    fs.mkdirSync(langDir, { recursive: true });

    // 预置一个孤儿和它的 .bak（模拟之前手动备份过）
    fs.writeFileSync(path.join(langDir, 'legacy.json'), '{"legacy.k":"v"}');
    fs.writeFileSync(path.join(langDir, 'legacy.json.bak'), '{"old.bak":"x"}');

    LanguageFileManager.writeLocaleFile(config, false, { 'order.title': '订单' }, 'zh-CN', {
      'order.title': 'order',
    });

    // legacy.json 仍存在（因为 .bak 已存在，不覆盖）
    expect(fs.existsSync(path.join(langDir, 'legacy.json'))).toBe(true);
    expect(fs.readFileSync(path.join(langDir, 'legacy.json.bak'), 'utf-8')).toBe('{"old.bak":"x"}');
  });

  it('updateLanguageFiles：规则变更后存量 key 按新规则重新落桶', () => {
    const config = makeConfig({
      buckets: {
        rules: [{ name: 'order', matchKey: (key) => key.startsWith('order.') }],
        defaultBucket: 'common',
        emitManifest: true,
        layout: 'by-locale',
      },
    });
    const langDir = path.join(config.io.localesDir, 'zh-CN');
    fs.mkdirSync(langDir, { recursive: true });
    // 模拟旧布局：order.title 错误地住在 misc.json 桶里（历史规则的产物）
    fs.writeFileSync(path.join(langDir, 'misc.json'), JSON.stringify({ 'order.title': '订单' }));

    // 用 updateLanguageFiles 触发：新增一个 user.name，触发整包重写
    LanguageFileManager.updateLanguageFiles(config, false, [
      {
        semanticId: 'user.name',
        original: '用户',
        processedMessage: '用户',
        filePath: path.join(tmpDir, 'src/anywhere.vue'),
        isTemplateString: false,
      } as any,
    ]);

    // 存量 order.title 被重分桶到 order.json；misc.json 被备份
    expect(JSON.parse(fs.readFileSync(path.join(langDir, 'order.json'), 'utf-8'))).toEqual({
      'order.title': '订单',
    });
    expect(fs.existsSync(path.join(langDir, 'misc.json'))).toBe(false);
    expect(fs.existsSync(path.join(langDir, 'misc.json.bak'))).toBe(true);
  });
});

describe('BucketResolver 命中统计', () => {
  it('记录每条规则的命中次数，0 命中规则会出现在 zeroHitRules 中', async () => {
    const { BucketResolver } = await import('../src/utils/bucket-resolver');
    const resolver = new BucketResolver({
      rules: [
        { name: 'matched', matchKey: (key: string) => key.startsWith('a.') },
        { name: 'never', matchKey: (key: string) => key.startsWith('nope.') },
      ],
      defaultBucket: 'common',
      emitManifest: true,
      layout: 'by-locale',
    });
    resolver.resolve('', 'a.x', 'A');
    resolver.resolve('', 'a.y', 'B');
    resolver.resolve('', 'c.z', 'C');
    expect(resolver.getHitStats()).toEqual({ matched: 2, never: 0 });
    expect(resolver.getZeroHitRules()).toEqual(['never']);
  });
});
