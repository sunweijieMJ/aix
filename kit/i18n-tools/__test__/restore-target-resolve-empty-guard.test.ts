import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RestoreProcessor } from '../src/core/RestoreProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归（HIGH）：restore 显式传 target 但全部解析为空时，绝不回退到全量扫描。
 *
 * 根因（修复前）：_execute 在 targets.length>0 时调 resolveTargetFiles，后者吞掉
 * 「路径不存在」异常、空目录也返回 []；restoreFiles 用 `targetFiles && targetFiles.length>0`
 * 判断，空数组落入 else 分支扫描整个 config.root。配合 overwrite=true → 就地改写整个项目，
 * 与用户「只还原这几个文件」意图完全相反。
 *
 * 修复：区分 undefined（未传 target → 全量）与 [](传了但解析空 → 只处理空集合 → 早退)。
 */
describe('RestoreProcessor — 显式 target 解析为空不回退全量扫描', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  // 已国际化、可被还原的源文件（若被误扫描+overwrite 会被改回中文）
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

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-empty-guard-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
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

  it('传空目录 + overwrite → 不改写项目里其它文件', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, SRC, 'utf-8');
    const emptyDir = path.join(srcDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });

    await new RestoreProcessor(buildConfig(rootDir), false).execute([emptyDir], undefined, true);

    // A.vue 必须保持国际化形态（若回退全量扫描会被 overwrite 还原成中文）
    expect(fs.readFileSync(file, 'utf-8')).toBe(SRC);
  });

  it('传不存在的路径 + overwrite → 不改写项目里其它文件', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, SRC, 'utf-8');

    await new RestoreProcessor(buildConfig(rootDir), false).execute(
      [path.join(srcDir, 'does-not-exist.vue')],
      undefined,
      true,
    );

    expect(fs.readFileSync(file, 'utf-8')).toBe(SRC);
  });

  it('完全不传 target → 仍按既有语义全量扫描（修复不影响默认行为）', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, SRC, 'utf-8');

    await new RestoreProcessor(buildConfig(rootDir), false).execute([], undefined, true);

    // 未传 target = 全量扫描 → A.vue 被还原为中文
    const out = fs.readFileSync(file, 'utf-8');
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
  });
});
