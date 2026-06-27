import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归（MEDIUM）：部分还原时，cleanupHookDependencies 必须与 cleanupImports /
 * cleanupVariableStatements 一样受 keepTranslationVar 守卫。
 *
 * 根因（修复前）：cleanupHookDependencies 无 keep 守卫，无条件把 t 从 hook 依赖数组剥离。
 * 当某个 t() 因 key 缺失/动态 key 未被还原时，translation 变量声明与 import 被保留
 * （keepTranslationVar=true），但 deps 数组里的 t 仍被删掉 → 回调体引用 t 而 deps 漏 t，
 * 触发 react-hooks/exhaustive-deps 违规 + 语言切换时闭包陈旧。
 *
 * 修复：cleanupHookDependencies(node, library, keepTranslationVar)，keepTranslationVar=true
 * 时直接返回原节点。
 */
describe('React restore — 部分还原时保留 hook deps 里的 t（keepTranslationVar 守卫）', () => {
  let dir: string;
  const lib = createReactI18nLibrary('react-i18next');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-partial-hook-deps-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(lib, '@/i18n').transform(file, locale);
  };

  // 一个 t() 可还原（k0 在 locale），另一个 t() 不可还原（missing 不在 locale）
  const SRC =
    `import React from 'react';\n` +
    `import { useTranslation } from 'react-i18next';\n` +
    `export function C() {\n` +
    `  const { t } = useTranslation();\n` +
    `  const fn = React.useCallback(() => t('missing') + t('k0'), [t]);\n` +
    `  return <button onClick={fn} />;\n` +
    `}\n`;

  it('有 t() 调用存活 → 声明、import、deps 里的 t 都保留', () => {
    const out = restore(SRC, { k0: '标题' });

    // 存活的 t('missing') 仍在（locale 缺该 key，无法还原）
    expect(out).toContain("t('missing')");
    // 可还原的 t('k0') 被还原为中文
    expect(out).toContain('标题');
    // translation 变量声明与 import 被保留（既有守卫）
    expect(out).toContain('useTranslation');
    // 关键：deps 数组里的 t 不被剥离 —— 不留 deps 漏项
    expect(out).toMatch(/\[\s*t\s*\]/);
  });

  it('对照：全部 t() 可还原 → t 声明与 deps 一并清除（既有行为不回归）', () => {
    const allRestorable =
      `import React from 'react';\n` +
      `import { useTranslation } from 'react-i18next';\n` +
      `export function C() {\n` +
      `  const { t } = useTranslation();\n` +
      `  const fn = React.useCallback(() => t('k0'), [t]);\n` +
      `  return <button onClick={fn} />;\n` +
      `}\n`;
    const out = restore(allRestorable, { k0: '标题' });

    expect(out).toContain('标题');
    expect(out).not.toContain("t('k0')");
    expect(out).not.toMatch(/useTranslation/);
    expect(out).not.toMatch(/\[\s*t\s*\]/);
  });
});
