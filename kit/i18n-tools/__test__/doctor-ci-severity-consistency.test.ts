import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DoctorProcessor } from '../src/core/DoctorProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * 回归：doctor 的 --ci 退出码与持久化报告 summary.bySeverity 口径不一致。
 *
 * --ci 闸门按 `findings.filter(severity === 'error')` 统计（含 error 级 lint：
 * hardcoded-comparison）；但 recordToReport 把 locale-lint 类发现整体跳过 addWarning，
 * 只经 LocaleValueLinter.emit 写入 needsManual——其 error severity 从未进入 severityTally。
 * 结果：进程以「N 个 error」失败退出，落盘报告却写 bySeverity.error=0，读 JSON 的看板会
 * 误判为「健康」。修复：error 级 lint 发现须同时计入 bySeverity（与 --ci 同源）。
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

describe('DoctorProcessor --ci 与报告 severity 口径一致', () => {
  let rootDir: string;
  let sourceDir: string;
  let localeDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-sev-'));
    sourceDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(sourceDir, { recursive: true });
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

  const readLatestReport = (): {
    summary: { bySeverity: Record<string, number>; needsManual: number };
  } => {
    const logsDir = path.join(rootDir, '.i18n-tools', 'logs');
    const file = fs
      .readdirSync(logsDir)
      .filter((f) => /^run-.*\.json$/.test(f))
      .sort()
      .pop();
    if (!file) throw new Error('no report flushed');
    return JSON.parse(fs.readFileSync(path.join(logsDir, file), 'utf-8'));
  };

  it('error 级 lint（hardcoded-comparison）计入 summary.bySeverity.error', async () => {
    // 源码 status === '已完成'：比较操作数（提取时跳过），且 '已完成' 已是 locale 值
    fs.writeFileSync(
      path.join(sourceDir, 'Status.ts'),
      `export const label = (status: string): string => {\n` +
        `  if (status === '已完成') return 'done';\n` +
        `  return 'idle';\n` +
        `};\n`,
    );
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ done: '已完成' }));
    fs.writeFileSync(path.join(localeDir, 'en-US.json'), JSON.stringify({ done: 'Done' }));

    // ci=false：只产出报告、不抛错，便于读 summary
    await new DoctorProcessor(buildConfig(rootDir, sourceDir, localeDir), false, undefined, {
      ci: false,
    }).execute();

    const report = readLatestReport();
    // 修复前：bySeverity.error===0（与 --ci「1 个 error」矛盾）
    expect(report.summary.bySeverity.error).toBe(1);
    // 明细仍保留在 needsManual 中（不丢可操作信息）
    expect(report.summary.needsManual).toBeGreaterThanOrEqual(1);
  });
});
