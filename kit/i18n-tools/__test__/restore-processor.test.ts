import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RestoreProcessor } from '../src/core/RestoreProcessor';
import { VueAdapter } from '../src/adapters/VueAdapter';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * RestoreProcessor 编排层测试（此前零覆盖：仅 VueRestoreTransformer 的 import 清理被单测）。
 *
 * 聚焦处理器自身、而非 transformer 的逻辑：
 *  - failedFiles>0 → 抛错（非零退出）：防 CI 把"几乎全失败"误判为成功（RestoreProcessor.ts:163）
 *  - 默认输出到 <root>/restored/，不覆盖原文件（:127-129）
 *  - overwrite=true 覆盖原文件（:127）
 */
describe('RestoreProcessor 编排层', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  // 已知可被还原的 script setup 形态（见 restore-cleanup-import.test.ts）
  const SRC = `<script setup lang="ts">\nimport { t } from '@/locale';\nconst m = t('k');\n</script>\n`;

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

  const writeSource = (rel: string, content: string): string => {
    const abs = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    return abs;
  };

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-proc-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    // 源语言文件：key 'k' → '你好'
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ k: '你好' }), 'utf-8');
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('还原失败 → 以非零退出（抛错），不静默吞掉', async () => {
    const file = writeSource('A.vue', SRC);
    const adapter = new VueAdapter('@/locale', 'vue-i18n');
    vi.spyOn(adapter.getRestoreTransformer(), 'transform').mockImplementation(() => {
      throw new Error('restore boom');
    });
    const proc = new RestoreProcessor(buildConfig(rootDir), false, adapter);

    await expect(proc.execute([file])).rejects.toThrow(/还原失败/);
  });

  it('默认输出到 <root>/restored/，原文件不被覆盖', async () => {
    const file = writeSource('A.vue', SRC);
    await new RestoreProcessor(buildConfig(rootDir), false).execute([file]);

    // 原文件保持国际化形态（未被覆盖）
    const original = fs.readFileSync(file, 'utf-8');
    expect(original).toContain("t('k')");
    expect(original).toContain("import { t } from '@/locale'");

    // 还原产物落在 restored/ 下，且已还原为中文、删掉死导入
    const restored = path.join(rootDir, 'restored', 'src', 'A.vue');
    expect(fs.existsSync(restored)).toBe(true);
    const out = fs.readFileSync(restored, 'utf-8');
    expect(out).toContain('你好');
    expect(out).not.toContain("import { t } from '@/locale'");
  });

  it('overwrite=true：直接覆盖原文件', async () => {
    const file = writeSource('A.vue', SRC);
    await new RestoreProcessor(buildConfig(rootDir), false).execute([file], undefined, true);

    const out = fs.readFileSync(file, 'utf-8');
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
    // 未生成 restored/ 目录产物
    expect(fs.existsSync(path.join(rootDir, 'restored', 'src', 'A.vue'))).toBe(false);
  });

  it('空 localeMap → 早退，不抛错也不产出', async () => {
    const file = writeSource('A.vue', SRC);
    // 语言文件为空对象
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({}), 'utf-8');

    await expect(
      new RestoreProcessor(buildConfig(rootDir), false).execute([file]),
    ).resolves.toBeUndefined();
    expect(fs.readFileSync(file, 'utf-8')).toBe(SRC); // 原文件未动
    expect(fs.existsSync(path.join(rootDir, 'restored'))).toBe(false);
  });

  it('目标传目录 → 扫描目录下的框架文件并还原', async () => {
    writeSource('A.vue', SRC);
    await new RestoreProcessor(buildConfig(rootDir), false).execute([srcDir]);

    const restored = path.join(rootDir, 'restored', 'src', 'A.vue');
    expect(fs.existsSync(restored)).toBe(true);
    expect(fs.readFileSync(restored, 'utf-8')).toContain('你好');
  });

  it('无 i18n 调用的文件 → 判为无需修改，不产出', async () => {
    const file = writeSource('Plain.vue', `<template>\n  <div>hello</div>\n</template>\n`);
    await new RestoreProcessor(buildConfig(rootDir), false).execute([file]);

    // 还原前后一致 → 跳过，不写 restored 产物
    expect(fs.existsSync(path.join(rootDir, 'restored', 'src', 'Plain.vue'))).toBe(false);
    expect(fs.readFileSync(file, 'utf-8')).toContain('<div>hello</div>');
  });
});
