import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DoctorProcessor } from '../src/core/DoctorProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归（B8）：checkMissingTargetKeys 用 `key in targetMap` 判断 target 是否已有该 key。
 * `in` 走原型链，名为 'toString'/'constructor' 等的 key 即使 target 真缺失也被误判为已存在，
 * missing-target-key 永远不报（假阴性）。修复：改用 Object.prototype.hasOwnProperty.call，
 * 与 checkMissingKeys/checkOrphanKeys 的判定纪律一致。
 */
const buildConfig = (rootDir: string, sourceDir: string, localeDir: string): ResolvedConfig =>
  resolveConfig({
    root: rootDir,
    framework: { type: 'vue', tImport: '@/locale' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: { localesDir: localeDir, sourceDir, format: 'flat' },
    keys: { separator: '.' },
    llm: { shared: { apiKey: 'x', model: 'm' } },
  } satisfies I18nToolsConfig);

describe('DoctorProcessor missing-target-key — 原型名 key', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-mtk-proto-'));
    sourceDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    infoSpy = vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const all = (): string => infoSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  it("名为 'toString' 的源 key 在 target 缺失时仍报 missing-target-key（修复前被原型链吞掉）", async () => {
    fs.writeFileSync(path.join(sourceDir, 'P.vue'), `<template>{{ t('toString') }}</template>`);
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ toString: '提交' }));
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({})); // target 真缺失

    await new DoctorProcessor(
      buildConfig(rootDir, sourceDir, localeDir),
      false,
      undefined,
      {},
    ).execute();

    expect(all()).toContain('[missing-target-key]');
    expect(all()).toContain('toString');
  });
});
