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

  // 回归（restore #1）：显式指定的 target 路径不存在（拼错文件名）时，旧实现仅 log error、
  // 返回空集合 → 走「没有找到需要处理的文件」早退、进程 exit 0，CI 误判 restore 成功。
  // 修复：无法解析的 target 计入失败收集器并硬失败（非零退出）。
  it('显式 target 不存在 → 硬失败（非零退出），不静默 exit 0', async () => {
    const missing = path.join(srcDir, 'does-not-exist.vue');
    await expect(
      new RestoreProcessor(buildConfig(rootDir), false).execute([missing]),
    ).rejects.toThrow(/无法解析/);
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

  // 回归（审计 P2）：overwrite 模式完全不用 outputDir，却无条件 ensureDirectoryExists，
  // 每次 `--overwrite` 都在项目根凭空留下一个空 restored/。
  it('overwrite=true：不创建输出目录（无副作用空目录）', async () => {
    const file = writeSource('A.vue', SRC);
    await new RestoreProcessor(buildConfig(rootDir), false).execute([file], undefined, true);

    expect(fs.readFileSync(file, 'utf-8')).toContain('你好');
    expect(fs.existsSync(path.join(rootDir, 'restored'))).toBe(false);
  });

  // 回归（审计 P2）：默认 outputDir 落在扫描根内，二次全量 restore 会把上次的 restored/
  // 副本当作源文件再处理，产出 restored/restored/ 套娃。
  it('二次全量 restore 不把上次的输出目录纳入处理集（无 restored/restored 套娃）', async () => {
    writeSource('A.vue', SRC);

    await new RestoreProcessor(buildConfig(rootDir), false).execute();
    expect(fs.existsSync(path.join(rootDir, 'restored', 'src', 'A.vue'))).toBe(true);

    await new RestoreProcessor(buildConfig(rootDir), false).execute();
    // 上次产出的 restored/src/A.vue 被排除在处理集之外（不再作为源文件二次还原）
    expect(LoggerUtils.warn).toHaveBeenCalledWith(
      expect.stringContaining('已排除 1 个位于输出目录内的文件'),
    );
    expect(fs.existsSync(path.join(rootDir, 'restored', 'restored'))).toBe(false);
  });

  /**
   * A-1：`.i18n-tools/plans/<ts>/sources/` 下是 dry-run 写出的转换后源码副本。
   * 全量 restore 若把它当源码处理：不带 --overwrite 时产出 restored/.i18n-tools/… 垃圾副本，
   * 带 --overwrite 时把副本就地还原成未国际化代码——随后 apply-plan 会把这份被还原的内容
   * 当「已审过的代码」写回源文件、同时照常写 localeDelta，落成源码无 t()/locale 有 key 的
   * 不一致态并报成功。plan 目录必须始终在扫描集之外。
   */
  it('A-1: 全量 restore 不扫描 .i18n-tools 下的 plan 源码副本', async () => {
    writeSource('A.vue', SRC);
    const planSources = path.join(rootDir, '.i18n-tools', 'plans', 'generate-x', 'sources', 'src');
    fs.mkdirSync(planSources, { recursive: true });
    const copy = path.join(planSources, 'A.vue');
    fs.writeFileSync(copy, SRC, 'utf-8');

    await new RestoreProcessor(buildConfig(rootDir), false).execute(undefined, undefined, true);

    // 源文件照常还原，plan 副本原样不动
    expect(fs.readFileSync(path.join(srcDir, 'A.vue'), 'utf-8')).toContain('你好');
    expect(fs.readFileSync(copy, 'utf-8')).toBe(SRC);
    expect(fs.existsSync(path.join(rootDir, 'restored', '.i18n-tools'))).toBe(false);
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

  // 回归（restore 安全网）：restore 此前是唯一没有 dry-run 的破坏性模式。
  // dry-run 必须在内存里跑完转换、逐文件报告，且零写盘（连输出目录都不建）。
  it('dryRun：零写盘（不建 restored/、不动源文件），但报告还原计数', async () => {
    const file = writeSource('A.vue', SRC);

    await new RestoreProcessor(buildConfig(rootDir), false).execute([file], undefined, false, {
      dryRun: true,
    });

    // 源文件与输出目录都没被碰过
    expect(fs.readFileSync(file, 'utf-8')).toBe(SRC);
    expect(fs.existsSync(path.join(rootDir, 'restored'))).toBe(false);

    // 逐文件预览点名了「将还原几处」与「将清理的声明行」
    expect(LoggerUtils.info).toHaveBeenCalledWith(
      expect.stringMatching(/将还原: .*A\.vue（1 处调用，清理 1 行 import\/hook 声明）/),
    );
    expect(LoggerUtils.info).toHaveBeenCalledWith(
      expect.stringContaining("import { t } from '@/locale'"),
    );
    // 汇总同样是「将」的口径
    expect(LoggerUtils.info).toHaveBeenCalledWith(expect.stringContaining('将还原调用点: 1 处'));
    expect(LoggerUtils.warn).toHaveBeenCalledWith(expect.stringContaining('未写入任何文件'));
  });

  it('dryRun：无需修改的文件不计入预览计数', async () => {
    const file = writeSource('Plain.vue', `<template>\n  <div>hello</div>\n</template>\n`);

    await new RestoreProcessor(buildConfig(rootDir), false).execute([file], undefined, false, {
      dryRun: true,
    });

    expect(LoggerUtils.info).toHaveBeenCalledWith(expect.stringContaining('将还原调用点: 0 处'));
    expect(fs.existsSync(path.join(rootDir, 'restored'))).toBe(false);
  });

  it('目标传目录 → 扫描目录下的框架文件并还原', async () => {
    writeSource('A.vue', SRC);
    await new RestoreProcessor(buildConfig(rootDir), false).execute([srcDir]);

    const restored = path.join(rootDir, 'restored', 'src', 'A.vue');
    expect(fs.existsSync(restored)).toBe(true);
    expect(fs.readFileSync(restored, 'utf-8')).toContain('你好');
  });

  it('非 overwrite 模式：目标在 sourceDir 之外 → 拒绝（不逃逸输出目录）', async () => {
    // 在 rootDir 之外的兄弟目录建一个可还原文件，作为显式 target 传入
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-outside-'));
    try {
      const outsideFile = path.join(outsideDir, 'Evil.vue');
      fs.writeFileSync(outsideFile, SRC, 'utf-8');

      // path.relative(root, outsideFile) 产出 `../..`，映射到 restored/ 会逃逸——应被拒绝，
      // 计入 failedFiles 后以「还原失败」非零退出，而非把内容写到输出目录之外。
      await expect(
        new RestoreProcessor(buildConfig(rootDir), false).execute([outsideFile]),
      ).rejects.toThrow(/还原失败/);

      // 原文件未被改动，且未在越界位置写出任何还原产物
      expect(fs.readFileSync(outsideFile, 'utf-8')).toBe(SRC);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('无 i18n 调用的文件 → 判为无需修改，不产出', async () => {
    const file = writeSource('Plain.vue', `<template>\n  <div>hello</div>\n</template>\n`);
    await new RestoreProcessor(buildConfig(rootDir), false).execute([file]);

    // 还原前后一致 → 跳过，不写 restored 产物
    expect(fs.existsSync(path.join(rootDir, 'restored', 'src', 'Plain.vue'))).toBe(false);
    expect(fs.readFileSync(file, 'utf-8')).toContain('<div>hello</div>');
  });
});
