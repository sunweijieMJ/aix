import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PruneProcessor } from '../src/core/PruneProcessor';
import { CsvImportProcessor } from '../src/core/CsvImportProcessor';
import inquirer from 'inquirer';
import { InteractiveUtils } from '../src/utils/interactive-utils';
import { LoggerUtils } from '../src/utils/logger';
import { createFrameworkAdapter } from '../src/adapters';
import { resolveConfig } from '../src/config/loader';
import { ModeName } from '../src/utils/types';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 端到端验证（2026-08-28）发现的 P1 回归集：破坏性命令（prune / csv-import）的
 * 非交互守卫。此前二者只认 --ci，非交互会话（--mode 推导）下仍会弹 inquirer 确认——
 * stdin 为常开管道（agent / CI 编排常见）时无限挂起。修复后：
 *  - 非交互且未 --ci → 破坏性写入前直接报错退出（「非交互 ⇒ 绝不碰 inquirer」）；
 *  - 交互取消 → 收尾打「已取消」，不再以「✅ …完成」的 SUCCESS 误导判读。
 */

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'destructive-guard-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const makeConfig = (): ResolvedConfig => {
  const user: I18nToolsConfig = {
    root: tmpDir,
    framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: { localesDir: 'locale', sourceDir: 'src', format: 'flat' },
    keys: { separator: '__' },
    llm: { shared: { apiKey: 'x', model: 'm' } },
  };
  return resolveConfig(user);
};

/**
 * 造出一个「有孤儿 key」的现场：源码引用 views__used（避开 prune 的
 * 「usedKeys===0 即中止」安全闸），locale 里额外有一个无引用的 views__orphan。
 */
const setupOrphanScene = (config: ResolvedConfig): void => {
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'src', 'App.vue'),
    `<template><div>{{ t('views__used') }}</div></template>\n`,
  );
  fs.mkdirSync(config.io.localesDir, { recursive: true });
  fs.writeFileSync(
    path.join(config.io.localesDir, 'zh-CN.json'),
    JSON.stringify({ views__used: '在用文案', views__orphan: '孤儿文案' }),
  );
  fs.writeFileSync(path.join(config.io.localesDir, 'en-US.json'), JSON.stringify({}));
};

describe('PruneProcessor — 非交互破坏性守卫', () => {
  it('非交互且未 --ci → 报错退出，绝不弹确认（防 stdin 常开管道挂起）', async () => {
    const config = makeConfig();
    setupOrphanScene(config);
    const promptSpy = vi
      .spyOn(InteractiveUtils, 'promptForGenericConfirmation')
      .mockResolvedValue(true);
    const processor = new PruneProcessor(config, false, createFrameworkAdapter(config), {
      dryRun: false,
      ci: false,
      interactive: false,
    });
    await expect(processor.execute()).rejects.toThrow(/需显式传 --ci/);
    // 关键：inquirer 路径一次都不许进
    expect(promptSpy).not.toHaveBeenCalled();
    // 破坏性写入未发生
    const after = JSON.parse(
      fs.readFileSync(path.join(config.io.localesDir, 'zh-CN.json'), 'utf-8'),
    );
    expect(after.views__orphan).toBe('孤儿文案');
  });

  it('交互取消 → 收尾打「已取消」而非 SUCCESS，且不删任何 key', async () => {
    const config = makeConfig();
    setupOrphanScene(config);
    vi.spyOn(InteractiveUtils, 'promptForGenericConfirmation').mockResolvedValue(false);
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    const successSpy = vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    const processor = new PruneProcessor(config, false, createFrameworkAdapter(config), {
      dryRun: false,
      ci: false,
      interactive: true,
    });
    await processor.execute();
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('已取消'))).toBe(true);
    expect(successSpy.mock.calls.some((c) => String(c[0]).includes('完成'))).toBe(false);
    const after = JSON.parse(
      fs.readFileSync(path.join(config.io.localesDir, 'zh-CN.json'), 'utf-8'),
    );
    expect(after.views__orphan).toBe('孤儿文案');
  });

  it('对照：--ci 下照常直接执行删除（不回归）', async () => {
    const config = makeConfig();
    setupOrphanScene(config);
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    const processor = new PruneProcessor(config, false, createFrameworkAdapter(config), {
      dryRun: false,
      ci: true,
      interactive: false,
    });
    await processor.execute();
    const after = JSON.parse(
      fs.readFileSync(path.join(config.io.localesDir, 'zh-CN.json'), 'utf-8'),
    );
    expect(after.views__orphan).toBeUndefined();
  });
});

describe('CsvImportProcessor — 非交互破坏性守卫', () => {
  const setupCsvScene = (config: ResolvedConfig): string => {
    fs.mkdirSync(config.io.localesDir, { recursive: true });
    fs.writeFileSync(
      path.join(config.io.localesDir, 'untranslated.json'),
      JSON.stringify({ k1: { 'zh-CN': '你好', 'en-US': '' } }),
    );
    fs.writeFileSync(path.join(config.io.localesDir, 'translations.json'), '{}');
    const csvPath = path.join(tmpDir, 'in.csv');
    fs.writeFileSync(csvPath, ['key,zh-CN,en-US', 'k1,你好,hello'].join('\n'));
    return csvPath;
  };

  it('非交互且未 --ci → 写回前报错退出，绝不弹确认', async () => {
    const config = makeConfig();
    const csvPath = setupCsvScene(config);
    const promptSpy = vi
      .spyOn(InteractiveUtils, 'promptForGenericConfirmation')
      .mockResolvedValue(true);
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    const processor = new CsvImportProcessor(config, false, {
      input: csvPath,
      dryRun: false,
      ci: false,
      interactive: false,
    });
    await expect(processor.execute()).rejects.toThrow(/需显式传 --ci/);
    expect(promptSpy).not.toHaveBeenCalled();
    const after = JSON.parse(
      fs.readFileSync(path.join(config.io.localesDir, 'untranslated.json'), 'utf-8'),
    );
    expect(after.k1['en-US']).toBe(''); // 未写回
  });

  it('交互取消 → 收尾打「已取消」而非 SUCCESS，且不写回', async () => {
    const config = makeConfig();
    const csvPath = setupCsvScene(config);
    vi.spyOn(InteractiveUtils, 'promptForGenericConfirmation').mockResolvedValue(false);
    const warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    const successSpy = vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    const processor = new CsvImportProcessor(config, false, {
      input: csvPath,
      dryRun: false,
      ci: false,
      interactive: true,
    });
    await processor.execute();
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('已取消'))).toBe(true);
    expect(successSpy.mock.calls.some((c) => String(c[0]).includes('完成'))).toBe(false);
    const after = JSON.parse(
      fs.readFileSync(path.join(config.io.localesDir, 'untranslated.json'), 'utf-8'),
    );
    expect(after.k1['en-US']).toBe('');
  });

  it('对照：省略 interactive（程序化调用默认）仍弹确认，行为不变', async () => {
    const config = makeConfig();
    const csvPath = setupCsvScene(config);
    const promptSpy = vi
      .spyOn(InteractiveUtils, 'promptForGenericConfirmation')
      .mockResolvedValue(true);
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
    const processor = new CsvImportProcessor(config, false, {
      input: csvPath,
      dryRun: false,
      ci: false,
    });
    await processor.execute();
    expect(promptSpy).toHaveBeenCalled();
    const after = JSON.parse(
      fs.readFileSync(path.join(config.io.localesDir, 'untranslated.json'), 'utf-8'),
    );
    expect(after.k1['en-US']).toBe('hello');
  });
});

/**
 * 破坏性确认的默认值：inquirer 的 confirm 会把 default 渲染成 (Y/n) / (y/N)。
 * 此前 promptForGenericConfirmation 恒为 `default: true`，prune 删孤儿 key、
 * csv-import 覆写 translations 都是回车即执行，且与用户读到的 "y/N" 直觉相反。
 */
describe('InteractiveUtils — 确认提示的默认值', () => {
  it('promptForGenericConfirmation 默认 No（破坏性动作回车不执行）', async () => {
    const promptSpy = vi.spyOn(inquirer, 'prompt').mockResolvedValue({ confirmed: false } as never);

    await InteractiveUtils.promptForGenericConfirmation('确认从所有 locale 删除孤儿 key？');

    expect(promptSpy).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'confirm', default: false }),
    ]);
  });

  it('显式声明时才默认 Yes：promptForConfirmation 委托后仍保持原有 default:true', async () => {
    const promptSpy = vi.spyOn(inquirer, 'prompt').mockResolvedValue({ confirmed: true } as never);

    const ok = await InteractiveUtils.promptForConfirmation(ModeName.PRUNE, false, false);

    expect(ok).toBe(true);
    expect(promptSpy).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'confirm', default: true }),
    ]);
  });
});
