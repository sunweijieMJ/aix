import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LanguageFileManager } from '../src/utils/language-file-manager';
import { MergeProcessor } from '../src/core/MergeProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { ExtractedString } from '../src/utils/types';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config/types';

/**
 * 「桶迁移窗口」回归：存量项目刚开启 buckets 时，legacy 单文件 `<locale>.json` 还在、
 * 尚无 `.bak`，而 generate/merge 只往桶目录写。这段窗口里读写视图必须一致，
 * 且首次触发迁移（pick/export → getMessages → migrateToBuckets）必须做并集而非整覆盖。
 *
 * 事故形态（修复前）：
 *   legacy 在 → generate/merge 把新 key/新译文写进桶 → pick/export 触发迁移
 *   → 迁移用 legacy 内容**整写**各桶、legacy 没有的桶被 pruneOrphanBucketFiles 改名 .bak
 *   → 新写的数据整体消失，全程 exit 0 无报错。
 */

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-bucket-migration-'));
  vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
  vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
  vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
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
    buckets: {
      rules: [
        { name: 'order', matchKey: (k: string) => k.startsWith('order.') },
        { name: 'extra', matchKey: (k: string) => k.startsWith('extra.') },
      ],
      defaultBucket: 'common',
      emitManifest: false,
      layout: 'by-locale',
    },
  };
  return resolveConfig(user);
}

const localeDir = () => path.join(tmpDir, 'locale');

const writeLegacy = (locale: string, data: Record<string, string>) => {
  fs.mkdirSync(localeDir(), { recursive: true });
  fs.writeFileSync(path.join(localeDir(), `${locale}.json`), JSON.stringify(data, null, 2));
};

const readBucket = (locale: string, bucket: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(localeDir(), locale, `${bucket}.json`), 'utf-8'));

describe('migrateToBuckets — 迁移写并集而非 legacy 整覆盖', () => {
  it('迁移不丢桶内新 key，且 legacy 旧值不回退覆盖桶内新值', () => {
    const config = makeConfig();

    // ① 存量：legacy 单文件（order.title 是旧值，order.old 只在 legacy 里）
    writeLegacy('zh-CN', { 'order.title': '订单', 'order.old': '旧文案' });
    writeLegacy('en-US', { 'order.title': 'Order', 'order.old': 'Old' });

    // ② 模拟迁移窗口内 generate/merge 只往桶里写：新增 order.new、并把 order.title 改成新值
    const mgr = new LanguageFileManager(config, false);
    mgr.writeLocaleFile({ 'order.title': '订单 v2', 'order.new': '新文案' }, 'zh-CN', {
      'order.title': 'order',
      'order.new': 'order',
    });
    mgr.writeLocaleFile({ 'order.title': 'Order v2', 'order.new': 'New' }, 'en-US', {
      'order.title': 'order',
      'order.new': 'order',
    });

    // ③ 随后首次跑 pick/export → getMessages 触发正式迁移
    const messages = new LanguageFileManager(config, false).getMessages();

    // 桶内新 key 不丢；legacy 独有 key 补入；同 key 冲突时桶值胜出（桶是当前权威格式）
    expect(messages['zh-CN']).toEqual({
      'order.title': '订单 v2',
      'order.new': '新文案',
      'order.old': '旧文案',
    });
    expect(messages['en-US']).toEqual({
      'order.title': 'Order v2',
      'order.new': 'New',
      'order.old': 'Old',
    });

    // 落盘同样是并集，不是 legacy 整覆盖
    expect(readBucket('zh-CN', 'order')).toEqual({
      'order.title': '订单 v2',
      'order.new': '新文案',
      'order.old': '旧文案',
    });

    // legacy 已备份并从活跃集移除
    expect(fs.existsSync(path.join(localeDir(), 'zh-CN.json'))).toBe(false);
    expect(fs.existsSync(path.join(localeDir(), 'zh-CN.json.bak'))).toBe(true);
    // 写过内容的桶不得被当成孤儿改名
    expect(fs.existsSync(path.join(localeDir(), 'zh-CN', 'order.json.bak'))).toBe(false);
  });

  it('孤儿桶判定基于并集：legacy 里没有的桶不被误改名 .bak', () => {
    const config = makeConfig();
    writeLegacy('zh-CN', { 'order.title': '订单' });
    writeLegacy('en-US', { 'order.title': 'Order' });

    // 迁移窗口内 generate 新建了一个 legacy 完全不知道的桶
    new LanguageFileManager(config, false).writeLocaleFile({ 'extra.foo': '额外' }, 'zh-CN', {
      'extra.foo': 'extra',
    });

    new LanguageFileManager(config, false).getMessages();

    expect(fs.existsSync(path.join(localeDir(), 'zh-CN', 'extra.json'))).toBe(true);
    expect(fs.existsSync(path.join(localeDir(), 'zh-CN', 'extra.json.bak'))).toBe(false);
    expect(readBucket('zh-CN', 'extra')).toEqual({ 'extra.foo': '额外' });
  });

  it('legacy 与桶都为空时仍只建目录占位并备份 legacy（保持原行为）', () => {
    const config = makeConfig();
    writeLegacy('zh-CN', {});
    writeLegacy('en-US', {});

    new LanguageFileManager(config, false).getMessages();

    expect(fs.existsSync(path.join(localeDir(), 'zh-CN'))).toBe(true);
    expect(fs.readdirSync(path.join(localeDir(), 'zh-CN'))).toEqual([]);
    expect(fs.existsSync(path.join(localeDir(), 'zh-CN.json.bak'))).toBe(true);
  });
});

describe('updateLanguageFiles — 桶式读侧并入未迁移 legacy', () => {
  const makeExtracted = (semanticId: string, original: string): ExtractedString => ({
    original,
    semanticId,
    filePath: path.join(tmpDir, 'src', 'App.vue'),
    line: 1,
    column: 1,
    context: 'template',
    componentType: 'setup',
  });

  it('generate 写桶时把 legacy 存量 key 一并带入，不产出只含新 key 的残缺桶', () => {
    const config = makeConfig();
    writeLegacy('zh-CN', { 'order.old': '旧文案' });

    new LanguageFileManager(config, false).updateLanguageFiles([
      makeExtracted('order.new', '新文案'),
    ]);

    expect(readBucket('zh-CN', 'order')).toEqual({
      'order.old': '旧文案',
      'order.new': '新文案',
    });
    // 读路径不得有迁移副作用：legacy 单文件仍在原处，等 pick/export 正式迁移
    expect(fs.existsSync(path.join(localeDir(), 'zh-CN.json'))).toBe(true);
    expect(fs.existsSync(path.join(localeDir(), 'zh-CN.json.bak'))).toBe(false);
  });

  it('已存在于 legacy 的 key 不会被当成新增重复生成', () => {
    const config = makeConfig();
    writeLegacy('zh-CN', { 'order.title': '订单' });
    const infoSpy = vi.spyOn(LoggerUtils, 'info');

    new LanguageFileManager(config, false).updateLanguageFiles([
      makeExtracted('order.title', '订单'),
    ]);

    // 值一致 → 无新增无更新，直接跳过写盘
    expect(infoSpy).toHaveBeenCalledWith('✅ 语言文件已是最新状态，无需更新');
    expect(fs.existsSync(path.join(localeDir(), 'zh-CN'))).toBe(false);
  });
});

describe('MergeProcessor 桶式路径 — 读侧并入未迁移 legacy', () => {
  it('merge 写回目标语言桶时保留 legacy 里的历史译文', async () => {
    const config = makeConfig();
    writeLegacy('zh-CN', { 'order.title': '订单', 'order.old': '旧文案' });
    writeLegacy('en-US', { 'order.old': 'Old' });
    fs.writeFileSync(
      path.join(localeDir(), 'untranslated.json'),
      JSON.stringify({ 'order.title': { 'zh-CN': '订单', 'en-US': 'Order' } }, null, 2),
    );
    fs.writeFileSync(path.join(localeDir(), 'translations.json'), JSON.stringify({}, null, 2));

    await new MergeProcessor(config, false).execute();

    // 本轮新译文 + legacy 历史译文都在桶里；修复前只读桶 → order.old 整写丢失
    expect(readBucket('en-US', 'order')).toEqual({
      'order.old': 'Old',
      'order.title': 'Order',
    });
  });
});
