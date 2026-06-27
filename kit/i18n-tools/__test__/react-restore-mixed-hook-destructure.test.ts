import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactRestoreTransformer } from '../src/strategies/react/ReactRestoreTransformer';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归：还原 react-i18next 的混合解构 `const { t, i18n } = useTranslation()` 时，cleanupVariableStatements
 * 不能因 isHookDeclaration 命中就把整条声明删掉——否则存活的 `i18n` 引用会报 TS2304。
 *
 * 根因（修复前）：isHookDeclaration 对 `{ t }` 与 `{ t, i18n }` 都返回 true，循环里先命中
 * 「hook 声明整条删除」分支，使下方「仅删翻译项、重建解构保留其余绑定」的逻辑永不可达。
 */
describe('React restore — useTranslation 混合解构保留非翻译绑定', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-restore-mixed-hook-'));
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

  it('t 全部可还原但 i18n 仍被引用 → 保留 const { i18n } = useTranslation()', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t, i18n } = useTranslation();\n` +
        `  const change = () => i18n.changeLanguage('en');\n` +
        `  return <button onClick={change}>{t('k')}</button>;\n` +
        `}\n`,
      { k: '你好' },
    );
    // i18n 绑定与引用都保留
    expect(out).toMatch(/const\s*\{\s*i18n\s*\}\s*=\s*useTranslation\(\)/);
    expect(out).toContain('i18n.changeLanguage');
    // t 已被还原、不再出现在解构里
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
    expect(out).not.toMatch(/\{\s*t\s*,\s*i18n\s*\}/);
  });

  it('纯 t 解构（无其他绑定）→ 整条删除，行为不变', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t } = useTranslation();\n` +
        `  return <span>{t('k')}</span>;\n` +
        `}\n`,
      { k: '你好' },
    );
    expect(out).toContain('你好');
    expect(out).not.toMatch(/useTranslation\(\)/);
  });

  it('t 仍有存活调用（key 缺失）→ 整条解构保留，不丢 t/i18n', () => {
    const out = restore(
      `import { useTranslation } from 'react-i18next';\n` +
        `export function C() {\n` +
        `  const { t, i18n } = useTranslation();\n` +
        `  void i18n;\n` +
        `  return <span>{t('missing')}</span>;\n` +
        `}\n`,
      {},
    );
    expect(out).toMatch(/const\s*\{\s*t\s*,\s*i18n\s*\}\s*=\s*useTranslation\(\)/);
    expect(out).toContain("t('missing')");
  });
});
