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
 * 回归（三轮审计 #5）：覆盖率分子（已国际化调用点）由 IdReuseResolver
 * scanExistingCallsInSources 统计，此前正则只认 `t()/$t()`。react-intl 项目用的是
 * `intl.formatMessage({ id })` / `<FormattedMessage id>`，react-i18next 的 `<Trans
 * i18nKey>` 也不匹配 —— 于是已 100% 国际化的 react-intl 文件 alreadyI18n 恒为 0，
 * 覆盖率被系统性低估，可误触 --coverage-threshold CI 卡点。
 * 修复：复用 source-key-scanner 的 CALL_FIRST_ARG + ATTR_PATTERNS 全量口径。
 */
describe('GenerateProcessor 覆盖率 — react-intl 调用点计入分子（审计三轮 #5）', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'react', library: 'react-intl', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-cov-react-intl-'));
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

  it('formatMessage / <FormattedMessage> 已国际化调用点计入 alreadyI18n', async () => {
    // done.tsx：无中文，已有两个 react-intl 调用点（formatMessage + FormattedMessage）
    fs.writeFileSync(
      path.join(srcDir, 'Done.tsx'),
      `import { useIntl, FormattedMessage } from 'react-intl';
export function Done() {
  const intl = useIntl();
  const label = intl.formatMessage({ id: 'home.title' });
  return <div title={label}><FormattedMessage id="home.subtitle" /></div>;
}
`,
      'utf-8',
    );
    // new.tsx：含一处新中文（本轮新生成）
    fs.writeFileSync(
      path.join(srcDir, 'New.tsx'),
      `export function New() {
  return <button>提交</button>;
}
`,
      'utf-8',
    );

    const proc = new GenerateProcessor(buildConfig(), false, false);
    await proc.execute(srcDir, true);

    const cov = proc.getCoverage();
    expect(cov?.newlyGenerated).toBe(1); // 提交
    // 修复前：alreadyI18n 恒为 0（formatMessage / FormattedMessage 不被 t()/$t() 正则匹配）
    expect(cov?.alreadyI18n).toBe(2); // home.title + home.subtitle
    expect(cov?.coverageRate).toBeCloseTo(1); // (2+1)/(2+1+0)
  });
});
