import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { HooksUtils } from '../src/strategies/react/hooks-utils';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归（medium×2）：restore 清理 hook 依赖数组必须与 generate 注入对称。
 *
 * 根因（修复前）：
 *  - #5 generate 端把 t 注入 useLayoutEffect 依赖，restore 端白名单漏了 useLayoutEffect；
 *  - #6 generate 端识别 React.useXxx 成员调用，restore 端遇非裸 Identifier 直接 bail。
 * 两种情况 restore 都删掉 `const { t } = useTranslation()` 声明，却把 [t] 留在依赖数组里
 * → 指向已删除变量的悬空引用（TS2304 / ReferenceError），round-trip 非幂等。
 *
 * 修复：两端共用 TRANSLATION_DEPENDENCY_HOOKS + resolveHookName（含 useLayoutEffect、
 * 兼容 React.useXxx）。
 */
describe('React restore — hook 依赖清理与 generate 对称', () => {
  let dir: string;
  const lib = createReactI18nLibrary('react-i18next');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-hook-deps-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(lib, '@/plugins/locale').transform(file, locale);
  };

  // generate 注入态（模拟）：声明 t + 在 hook 里用 t() + 依赖数组含 [t]
  const injected = (hookExpr: string): string =>
    `import React from 'react';\n` +
    `import { useTranslation } from 'react-i18next';\n` +
    `export function C() {\n` +
    `  const { t } = useTranslation();\n` +
    `  ${hookExpr}\n` +
    `  return null;\n` +
    `}\n`;

  it('#5 useLayoutEffect：restore 后清掉 [t]，不留悬空引用', () => {
    const out = restore(injected(`useLayoutEffect(() => { document.title = t('k0'); }, [t]);`), {
      k0: '标题',
    });
    expect(out).toContain('标题'); // 文案还原
    expect(out).not.toContain("t('k0')"); // 调用还原
    expect(out).not.toMatch(/\[\s*t\s*\]/); // 关键：依赖数组里的 t 已清除
    expect(out).not.toMatch(/useTranslation/); // 声明已移除
  });

  it('#6 React.useEffect（成员调用）：restore 后清掉 [t]，不留悬空引用', () => {
    const out = restore(injected(`React.useEffect(() => { document.title = t('k0'); }, [t]);`), {
      k0: '标题',
    });
    expect(out).toContain('标题');
    expect(out).not.toContain("t('k0')");
    expect(out).not.toMatch(/\[\s*t\s*\]/);
    expect(out).not.toMatch(/useTranslation/);
  });

  it('generate 注入侧确实覆盖 useLayoutEffect 与 React.useEffect（对称前提）', () => {
    const code =
      `import React from 'react';\n` +
      `export function C() {\n` +
      `  const t = (k: string) => k;\n` +
      `  useLayoutEffect(() => { document.title = t('x'); }, []);\n` +
      `  React.useEffect(() => { document.title = t('y'); }, []);\n` +
      `  return null;\n` +
      `}\n`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    // 两个 hook 的依赖数组都应被注入 t
    const layoutDeps = out.match(/useLayoutEffect\([^,]+,\s*\[([^\]]*)\]/);
    const effectDeps = out.match(/React\.useEffect\([^,]+,\s*\[([^\]]*)\]/);
    expect(layoutDeps?.[1]).toContain('t');
    expect(effectDeps?.[1]).toContain('t');
  });
});
