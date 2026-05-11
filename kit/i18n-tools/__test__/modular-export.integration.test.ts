import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LanguageFileManager } from '../src/utils/language-file-manager';
import type { ResolvedConfig } from '../src/config/types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-modular-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    rootDir: tmpDir,
    framework: 'vue',
    vue: { library: 'vue-i18n', namespace: '' },
    react: { library: 'react-i18next', namespace: '', includeDefaultMessage: false },
    locale: { source: 'zh-CN', target: 'en-US' },
    paths: {
      locale: path.join(tmpDir, 'locale'),
      exportLocale: path.join(tmpDir, 'export'),
      source: path.join(tmpDir, 'src'),
      tImport: '@/plugins/locale',
    },
    llm: {
      idGeneration: { apiKey: 'x', model: 'm', timeout: 60000, maxRetries: 2, temperature: 0.1 },
      translation: { apiKey: 'x', model: 'm', timeout: 60000, maxRetries: 2, temperature: 0.1 },
    },
    prompts: { idGeneration: {}, translation: {} },
    idPrefix: {
      anchor: 'src',
      value: '',
      separator: '__',
      chineseMappings: {},
      reuseAcrossDirectories: false,
    },
    glossary: { override: 'always', normalize: true },
    concurrency: { idGeneration: 5, translation: 3 },
    batchSize: 10,
    batchDelay: 500,
    format: false,
    include: ['**/*.vue'],
    exclude: [],
    output: { format: 'flat' },
    ...overrides,
  } as ResolvedConfig;
}

describe('LanguageFileManager modular write', () => {
  it('未配置 modules 时写单文件（向后兼容）', () => {
    const config = makeConfig();
    fs.mkdirSync(config.paths.locale, { recursive: true });

    LanguageFileManager.writeLocaleFile(config, false, { 'order.title': '订单' }, 'zh-CN');

    const singleFile = path.join(config.paths.locale, 'zh-CN.json');
    expect(fs.existsSync(singleFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(singleFile, 'utf-8'))).toEqual({
      'order.title': '订单',
    });
  });

  it('配置 modules 时按模块分桶写入', () => {
    const config = makeConfig({
      modules: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultModule: 'common',
        manifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.paths.locale, { recursive: true });

    LanguageFileManager.writeLocaleFile(
      config,
      false,
      { 'order.title': '订单', 'user.name': '用户' },
      'zh-CN',
      { 'order.title': 'order', 'user.name': 'common' },
    );

    const orderFile = path.join(config.paths.locale, 'zh-CN', 'order.json');
    const commonFile = path.join(config.paths.locale, 'zh-CN', 'common.json');
    expect(JSON.parse(fs.readFileSync(orderFile, 'utf-8'))).toEqual({ 'order.title': '订单' });
    expect(JSON.parse(fs.readFileSync(commonFile, 'utf-8'))).toEqual({ 'user.name': '用户' });
  });

  it('启用模块化时自动从单文件迁移并备份', () => {
    const config = makeConfig({
      modules: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultModule: 'common',
        manifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.paths.locale, { recursive: true });
    fs.writeFileSync(
      path.join(config.paths.locale, 'zh-CN.json'),
      JSON.stringify({ 'legacy.key': '历史' }),
    );

    LanguageFileManager.getMessages(config, false);

    expect(fs.existsSync(path.join(config.paths.locale, 'zh-CN.json.bak'))).toBe(true);
    expect(fs.existsSync(path.join(config.paths.locale, 'zh-CN.json'))).toBe(false);
    const migrated = JSON.parse(
      fs.readFileSync(path.join(config.paths.locale, 'zh-CN', 'common.json'), 'utf-8'),
    );
    expect(migrated).toEqual({ 'legacy.key': '历史' });
  });

  it('迁移是幂等的（第二次运行不再创建 .bak）', () => {
    const config = makeConfig({
      modules: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultModule: 'common',
        manifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.paths.locale, { recursive: true });
    fs.writeFileSync(path.join(config.paths.locale, 'zh-CN.json'), '{"k":"v"}');

    LanguageFileManager.getMessages(config, false);
    const firstBakStat = fs.statSync(path.join(config.paths.locale, 'zh-CN.json.bak'));

    LanguageFileManager.getMessages(config, false);
    const secondBakStat = fs.statSync(path.join(config.paths.locale, 'zh-CN.json.bak'));
    expect(secondBakStat.mtimeMs).toBe(firstBakStat.mtimeMs);
  });

  it('getMessages 启用模块化时合并目录下所有 json', () => {
    const config = makeConfig({
      modules: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultModule: 'common',
        manifest: true,
        layout: 'by-locale',
      },
    });
    const langDir = path.join(config.paths.locale, 'zh-CN');
    fs.mkdirSync(langDir, { recursive: true });
    fs.writeFileSync(path.join(langDir, 'order.json'), '{"order.title":"订单"}');
    fs.writeFileSync(path.join(langDir, 'common.json'), '{"common.confirm":"确认"}');

    const messages = LanguageFileManager.getMessages(config, false);
    expect(messages['zh-CN']).toEqual({
      'order.title': '订单',
      'common.confirm': '确认',
    });
  });

  it('layout=by-module 时按 <module>/<locale>.json 写入', () => {
    const config = makeConfig({
      modules: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultModule: 'common',
        manifest: true,
        layout: 'by-module',
      },
    });
    fs.mkdirSync(config.paths.locale, { recursive: true });

    LanguageFileManager.writeLocaleFile(
      config,
      false,
      { 'order.title': '订单', 'user.name': '用户' },
      'zh-CN',
      { 'order.title': 'order', 'user.name': 'common' },
    );

    const orderFile = path.join(config.paths.locale, 'order', 'zh-CN.json');
    const commonFile = path.join(config.paths.locale, 'common', 'zh-CN.json');
    expect(JSON.parse(fs.readFileSync(orderFile, 'utf-8'))).toEqual({ 'order.title': '订单' });
    expect(JSON.parse(fs.readFileSync(commonFile, 'utf-8'))).toEqual({ 'user.name': '用户' });
  });

  it('layout=by-module 时 getMessages 正确读取（回归 Bug：之前硬编码 by-locale 导致返回空）', () => {
    const config = makeConfig({
      modules: {
        rules: [{ name: 'order', match: 'src/views/order/**' }],
        defaultModule: 'common',
        manifest: true,
        layout: 'by-module',
      },
    });
    const orderDir = path.join(config.paths.locale, 'order');
    const commonDir = path.join(config.paths.locale, 'common');
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

  it('matchKey 规则按 key 字面匹配分桶（buildKeyModuleMap 全链路）', () => {
    const config = makeConfig({
      modules: {
        rules: [
          { name: 'order', matchKey: (key) => key.startsWith('order.') },
          { name: 'user', matchKey: (key) => key === 'user.name' || key === 'user.email' },
        ],
        defaultModule: 'common',
        manifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.paths.locale, { recursive: true });

    const localeMap = { 'order.title': '订单', 'user.name': '用户', 'misc.foo': '其它' };
    const keyModuleMap = LanguageFileManager.buildKeyModuleMap(config, localeMap);

    expect(keyModuleMap).toEqual({
      'order.title': 'order',
      'user.name': 'user',
      'misc.foo': 'common',
    });

    LanguageFileManager.writeLocaleFile(config, false, localeMap, 'zh-CN', keyModuleMap);

    const orderFile = path.join(config.paths.locale, 'zh-CN', 'order.json');
    const userFile = path.join(config.paths.locale, 'zh-CN', 'user.json');
    const commonFile = path.join(config.paths.locale, 'zh-CN', 'common.json');
    expect(JSON.parse(fs.readFileSync(orderFile, 'utf-8'))).toEqual({ 'order.title': '订单' });
    expect(JSON.parse(fs.readFileSync(userFile, 'utf-8'))).toEqual({ 'user.name': '用户' });
    expect(JSON.parse(fs.readFileSync(commonFile, 'utf-8'))).toEqual({ 'misc.foo': '其它' });
  });

  it('所有 key 都未命中规则时全部落入 defaultModule', () => {
    const config = makeConfig({
      modules: {
        rules: [{ name: 'order', matchKey: (key) => key.startsWith('order.') }],
        defaultModule: 'common',
        manifest: true,
        layout: 'by-locale',
      },
    });
    fs.mkdirSync(config.paths.locale, { recursive: true });

    LanguageFileManager.writeLocaleFile(config, false, { 'a.x': 'A', 'b.y': 'B' }, 'zh-CN', {
      'a.x': 'common',
      'b.y': 'common',
    });

    const commonFile = path.join(config.paths.locale, 'zh-CN', 'common.json');
    expect(JSON.parse(fs.readFileSync(commonFile, 'utf-8'))).toEqual({ 'a.x': 'A', 'b.y': 'B' });
    expect(fs.existsSync(path.join(config.paths.locale, 'zh-CN', 'order.json'))).toBe(false);
  });
});
