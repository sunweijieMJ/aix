import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归：还原混合解构 `const { t, i18n } = useTranslation()` 且所有 t() 都能从 locale 还原时，
 * cleanupVariableStatements 会保留 `const { i18n } = useTranslation()`，但 cleanupImports 在
 * keepLibraryImport=false 时仍整条删除 `import { useTranslation } from 'react-i18next'`，
 * 产出引用未定义符号的不可编译代码（TS2304）。
 *
 * 根因（修复前）：keepLibraryImport 只由 survivalScan 在「翻译调用/组件存活」时置位，完全不感知
 * 被保留下来的非翻译 hook 绑定（i18n）。修复：survivalScan 检测到混合解构 hook 含残余非翻译绑定时，
 * 用独立标志保留库 import（仅作用于 import 清理，不影响 HOC 解除门控）。
 *
 * 注意：姊妹文件 react-restore-mixed-hook-destructure.test.ts 只断言「绑定保留」，未断言「import 保留」，
 * 故未拦住此 bug；本文件专门补 import 存活断言。
 */
describe('React restore — 混合解构保留 i18n 时库 import 必须存活', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-import-survival-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restore = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'F.tsx');
    fs.writeFileSync(file, code);
    const lib = createReactI18nLibrary('react-i18next');
    return new ReactRestoreTransformer(lib, '@/i18n').transform(file, locale);
  };

  it('t 全部可还原但 i18n 仍被引用 → 保留 import { useTranslation }', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t, i18n } = useTranslation();\n` +
        `  const change = () => i18n.changeLanguage('en');\n` +
        `  return <button onClick={change}>{t('k')}</button>;\n` +
        `}\n`,
      { k: '你好' },
    );
    // 残余绑定保留（既有行为）
    expect(out).toMatch(/const\s*\{\s*i18n\s*\}\s*=\s*useTranslation\(\)/);
    // 关键修复：useTranslation 的 import 必须仍在，否则 const { i18n } = useTranslation() 引用未定义
    expect(out).toMatch(/import\s*\{\s*useTranslation\s*\}\s*from\s*['"]react-i18next['"]/);
    // t 已被还原
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
  });

  it('纯 t 解构（无残余绑定）→ 库 import 整条删除，行为不变', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <span>{t('k')}</span>;\n` +
        `}\n`,
      { k: '你好' },
    );
    expect(out).toContain('你好');
    expect(out).not.toMatch(/useTranslation/);
  });
});
