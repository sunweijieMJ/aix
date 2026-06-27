import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归（B1）：transformToMemory 把 filePath 规范化后传给 transformer，而 transformer 用
 * `s.filePath === filePath` 严格比较；ExtractedString.filePath 原样透传用户输入路径。
 * 单文件模式下若输入路径含 `./`（或 Windows 反斜杠），规范化后两者不等 → 命中 0 条、
 * 源码原样返回，却仍写了 locale —— 静默的「源码改了 locale，源码却没改」不一致。
 * 修复：transformer 两侧都 path.normalize 后再比较。
 */
describe('GenerateProcessor 单文件 — 规范化路径不一致不致源码漏改', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const VUE_FILE = `<template><div>提交</div></template>\n`;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-pathnorm-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    CommonASTUtils.drainSkippedComparisonOperands();
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('输入路径含冗余 `.` 段时源码仍被改写（修复前源码原样、仅 locale 被写）', async () => {
    const realFile = path.join(srcDir, 'A.vue');
    fs.writeFileSync(realFile, VUE_FILE, 'utf-8');

    // 构造一个 path.normalize 会改变的等价路径（跨平台：插入冗余的 `.` 段）
    const weirdPath = srcDir + path.sep + '.' + path.sep + 'A.vue';
    expect(path.normalize(weirdPath)).not.toBe(weirdPath);

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await proc.execute(weirdPath, true);

    const transformed = fs.readFileSync(realFile, 'utf-8');
    expect(transformed).toContain('$t(');
    expect(transformed).not.toContain('>提交<');
  });
});
