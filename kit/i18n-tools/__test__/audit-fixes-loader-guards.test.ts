import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig } from '../src/config/types';

/**
 * 回归（审计修复）：loader 配置守卫
 *  - 审计 ⑥：locales.source / 每个 target 的空串/纯空白必须 fail-fast（否则落出畸形 `.json`）。
 *  - 审计 ③：用户提供 io.exclude 时整体替换默认值，必须强制并入 node_modules/.git 安全集；
 *            含 '/' 的 literal exclude 仅按 basename 匹配、永远命中不了，应给出告警。
 */
describe('loader 配置守卫（审计修复 ③/⑥）', () => {
  afterEach(() => vi.restoreAllMocks());

  const base = (over: Partial<I18nToolsConfig> = {}): I18nToolsConfig => ({
    root: process.cwd(),
    framework: { type: 'vue' },
    locales: { source: 'zh-CN', targets: ['en-US'] },
    io: { localesDir: 'src/i18n', sourceDir: 'src' },
    llm: { shared: { apiKey: 'x', model: 'm' } },
    ...over,
  });

  it('locales.source 为空串 → 抛错', () => {
    expect(() => resolveConfig(base({ locales: { source: '', targets: ['en-US'] } }))).toThrow(
      /locales\.source/,
    );
  });

  it('locales.source 为纯空白 → 抛错', () => {
    expect(() => resolveConfig(base({ locales: { source: '  ', targets: ['en-US'] } }))).toThrow(
      /locales\.source/,
    );
  });

  it('locales.targets 含空串 → 抛错', () => {
    expect(() =>
      resolveConfig(base({ locales: { source: 'zh-CN', targets: ['en-US', ''] } })),
    ).toThrow(/locales\.targets/);
  });

  it('合法 locales 不受影响', () => {
    expect(() =>
      resolveConfig(base({ locales: { source: 'zh-CN', targets: ['en-US', 'ja-JP'] } })),
    ).not.toThrow();
  });

  it('用户 io.exclude 强制并入 node_modules/.git 安全集', () => {
    const resolved = resolveConfig(base({ io: { exclude: ['legacy'] } }));
    expect(resolved.io.exclude).toContain('node_modules');
    expect(resolved.io.exclude).toContain('.git');
    expect(resolved.io.exclude).toContain('legacy');
  });

  it('未配置 io.exclude → 保留含测试/故事/构建产物的完整默认集', () => {
    const resolved = resolveConfig(base());
    expect(resolved.io.exclude).toContain('node_modules');
    expect(resolved.io.exclude).toEqual(expect.arrayContaining(['**/*.test.*', '**/*.stories.*']));
  });

  it('含 "/" 的 literal exclude 给出告警（仅 basename 匹配命中不了）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveConfig(base({ io: { exclude: ['src/legacy'] } }));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/src\/legacy/));
  });

  it('glob 形式的 exclude（含 \\*\\*）不触发告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveConfig(base({ io: { exclude: ['**/legacy/**'] } }));
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/命中不了/));
  });
});
