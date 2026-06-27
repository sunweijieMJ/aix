import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { GeneratePlanWriter, type GeneratePlan } from '../src/core/GeneratePlan';
import { LLMClient } from '../src/utils/llm-client';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归（LOW）：semanticId 为原型成员名（如 'constructor'）时，dry-run plan 的 localeDelta
 * 去重不得用 `in` 运算符把它丢掉。
 *
 * 根因（修复前）：`if (!(item.semanticId in localeDelta))` 走原型链，`'constructor' in {}` 恒为
 * true → 该 key 永不写入 localeDelta。apply 阶段从 plan.localeDelta 重建 locale 值，于是源码被
 * 改成 t('constructor') 却没有对应 locale 条目（源码/locale 不一致）。
 *
 * 修复：改用 Object.prototype.hasOwnProperty.call。
 */
describe('GenerateProcessor dry-run — 原型名 key 不被 `in` 去重丢弃', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  // 空前缀（custom 策略返回 []），使 full id 等于裸 semantic 部分 'constructor'
  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      keys: { separator: '.', prefix: { strategy: 'custom', resolve: () => [] } },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-proto-key-'));
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

  it("LLM 返回 id 'constructor' → 该 key 仍写入 plan.localeDelta", async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, `<template><div>提交</div></template>\n`, 'utf-8');

    // 单条文本，LLM 返回原型成员名作为语义 ID
    vi.spyOn(LLMClient.prototype, 'generateSemanticIdsForFiles').mockImplementation(
      async (groups: Record<string, string[]>) => {
        const out: Record<string, string[]> = {};
        for (const fp of Object.keys(groups)) out[fp] = ['constructor'];
        return out;
      },
    );

    await new GenerateProcessor(buildConfig(), false, false).execute(file, false, { dryRun: true });

    const planPath = GeneratePlanWriter.resolveLatest(path.join(rootDir, '.i18n-tools', 'plans'));
    expect(planPath).not.toBeNull();
    const { plan } = GeneratePlanWriter.read(planPath!) as { plan: GeneratePlan };

    // 关键：'constructor' 作为 own property 写入了 localeDelta（修复前会被 `in` 丢弃）
    expect(Object.prototype.hasOwnProperty.call(plan.localeDelta, 'constructor')).toBe(true);
    expect(plan.localeDelta['constructor']).toBe('提交');
  });
});
