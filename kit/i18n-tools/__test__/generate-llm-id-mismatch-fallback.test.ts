import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LLMClient } from '../src/utils/llm-client';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归 #3：LLM 返回的 id 数量与文本数不匹配时（最常见 LLM 故障：丢/多一条），
 * 旧逻辑仅打印「将使用本地ID生成进行回退」却仍 strings.forEach 按位取 ids[index]——
 * 导致错位的有效 id 被当语义 ID 写成 key，「回退」承诺并未兑现。
 *
 * 期望（忠实回退）：长度不匹配时整文件强制走本地 ID 回退，LLM 返回的错位 id 不得出现在任何 key 中。
 */
describe('GenerateProcessor：LLM id 数量不匹配时整文件本地回退（回归 #3）', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (root: string): ResolvedConfig =>
    resolveConfig({
      root,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(root, 'src'),
        localesDir: path.join(root, 'locale'),
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-llm-mismatch-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('LLM 返回的 id 比文本少一条 → 错位 id 不写入任何 key，全部本地回退', async () => {
    // 两个文本节点 → 2 条待生成 ID；LLM 只返回 1 条 → 长度不匹配
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(
      file,
      `<template>\n  <div>提交</div>\n  <div>取消</div>\n</template>\n`,
      'utf-8',
    );

    vi.spyOn(LLMClient.prototype, 'generateSemanticIdsForFiles').mockImplementation(
      async (groups: Record<string, string[]>) => {
        const out: Record<string, string[]> = {};
        for (const fp of Object.keys(groups)) out[fp] = ['wrongllmid']; // 长度=1，强制不匹配
        return out;
      },
    );

    const proc = new GenerateProcessor(buildConfig(rootDir), false, false);
    await proc.execute(file, false); // skipLLM=false → 走 LLM 路径

    const zh = JSON.parse(fs.readFileSync(path.join(localeDir, 'zh-CN.json'), 'utf-8')) as Record<
      string,
      string
    >;

    // 两条原文都已落地（提取/写入正常）
    expect(Object.values(zh)).toContain('提交');
    expect(Object.values(zh)).toContain('取消');
    // 关键：LLM 返回的错位 id 不得污染任何 key（长度不匹配 → 整文件本地回退）
    expect(Object.keys(zh).some((k) => k.includes('wrongllmid'))).toBe(false);
  });
});
