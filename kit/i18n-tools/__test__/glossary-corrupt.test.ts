import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Glossary } from '../src/utils/glossary';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：Glossary.load 文档承诺「JSON 解析失败 → 抛错」，但实际依赖 safeLoadJsonFile，
 * 损坏 JSON 被静默吞成 {} → 返回空词表并打印「(0 条)」。用户配了词表却因文件存坏导致
 * 所有 lookup 静默 miss、术语全部回退 LLM 而无从察觉，违反 fail-fast 契约。
 * 修复：文件存在但 JSON 损坏时抛错；文件不存在仍返回 null（显式启用语义不变）。
 */
describe('Glossary.load 损坏守卫', () => {
  let rootDir: string;
  let glossaryFile: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: path.join(rootDir, 'src'), localesDir: path.join(rootDir, 'locale') },
      keys: { separator: '.' },
      glossary: { file: glossaryFile },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-corrupt-'));
    glossaryFile = path.join(rootDir, 'glossary.json');
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('文件存在但 JSON 损坏 → 抛错', () => {
    fs.writeFileSync(glossaryFile, '{ "确认": "Confirm"', 'utf-8'); // 缺右括号
    expect(() => Glossary.load(buildConfig())).toThrow(/词表.*解析失败|解析失败|损坏/);
  });

  it('文件不存在 → 返回 null（显式启用语义不变）', () => {
    fs.rmSync(glossaryFile, { force: true });
    expect(Glossary.load(buildConfig())).toBeNull();
  });

  it('合法词表正常加载', () => {
    fs.writeFileSync(glossaryFile, JSON.stringify({ 确认: 'Confirm' }), 'utf-8');
    const map = Glossary.load(buildConfig());
    expect(map?.get('确认')).toEqual({ 'en-US': 'Confirm' });
  });
});
