import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归（审计 Med）：restore 清理不得按名误删「来源与 i18n 无关」的同名解构 / 依赖。
 *
 * 根因（修复前）：
 *  - cleanupVariableStatements 通用分支对任意对象解构按名剥离 t/intl，不校验初始化器来源
 *    → `const { t } = useTemperature()` 被整条删除，t 运行时 undefined（TS2304 / ReferenceError）。
 *  - cleanupHookDependencies 同样按名从 deps 数组删 t/intl
 *    → `useMemo(() => compute(t), [t])`（t 为温度）被删依赖，留下悬空 deps + 陈旧闭包。
 *
 * 修复：解构清理收窄到 `this.props`（HOC 注入形态）；依赖清理收窄到「回调体内 t 的出现
 * 全部是翻译调用被调名」时才剥离。本测试覆盖「不相关同名」必须原样保留。
 *
 * 注：合法路径（const { t } = useTranslation() / const { t } = this.props /
 * useLayoutEffect 注入 [t] 的对称移除）由 react-class-hoc-restore、
 * react-hook-deps-restore-symmetry 等既有用例守护，此处不重复。
 */
describe('React restore — 不误删来源无关的同名 t/intl', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-unrelated-var-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const restoreI18next = (code: string, locale: Record<string, string>): string => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    return new ReactRestoreTransformer(
      createReactI18nLibrary('react-i18next'),
      '@/plugins/locale',
    ).transform(file, locale);
  };

  it('变量声明：`const { t } = useTemperature()`（非 i18n 来源）在 restore 后整条保留', () => {
    const code =
      `import { useTranslation } from 'react-i18next';\n` +
      `function useTemperature() { return { t: 25 }; }\n` +
      `export function A() {\n` +
      `  const { t } = useTranslation();\n` +
      `  return <p>{t('a')}</p>;\n` +
      `}\n` +
      `export function B() {\n` +
      `  const { t } = useTemperature();\n` +
      `  return <span>{t}</span>;\n` +
      `}\n`;

    const out = restoreI18next(code, { a: '你好' });

    // A 的 i18n 调用与声明被正常还原/清理
    expect(out).toContain('你好');
    expect(out).not.toContain('useTranslation()');
    // 关键：B 的不相关解构必须原样保留，未被按名删除
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTemperature\(\)/);
  });

  it('依赖数组：`useMemo(() => t * 2, [t])`（t 为非 i18n 值）在 restore 后保留 [t]', () => {
    const code =
      `import { useMemo } from 'react';\n` +
      `import { useTranslation } from 'react-i18next';\n` +
      `function useTemp() { return 25; }\n` +
      `export function A() {\n` +
      `  const { t } = useTranslation();\n` +
      `  return <p>{t('a')}</p>;\n` +
      `}\n` +
      `export function B() {\n` +
      `  const t = useTemp();\n` +
      `  const v = useMemo(() => t * 2, [t]);\n` +
      `  return <span>{v}</span>;\n` +
      `}\n`;

    const out = restoreI18next(code, { a: '你好' });

    expect(out).toContain('你好');
    // 关键：不相关 hook 的依赖项 [t] 必须保留（否则 stale closure / exhaustive-deps 违规）
    expect(out).toMatch(/useMemo\([^,]+,\s*\[\s*t\s*\]\)/);
    expect(out).toMatch(/const\s+t\s*=\s*useTemp\(\)/);
  });
});
