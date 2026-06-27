import { describe, it, expect } from 'vitest';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

function buildInjector() {
  const library = createReactI18nLibrary('react-i18next');
  const importManager = new ReactImportManager('@/i18n', library);
  return new ReactComponentInjector(library, importManager);
}

/**
 * 回归 #1：isTranslationAvailableInScope 旧正则 `/const\s+\{\s*t\s*[,}]/` 要求 t 是
 * 解构的第一个绑定。对 react-i18next 极常见的 `const { i18n, t } = useTranslation()`
 * （t 非首位）判定失败 → injector 误判 t 不在作用域 → 再插入第二个
 * `const { t } = useTranslation();` → `Cannot redeclare block-scoped variable 't'`，
 * 整文件无法编译。
 */
describe('ReactComponentInjector：t 非解构首位时不重复注入 hook（回归 #1）', () => {
  it('const { i18n, t } = useTranslation() 已在作用域时，不再插入第二个 useTranslation', () => {
    const injector = buildInjector();
    const code = `const Badge = ({ status }: { status: string }) => {
  const { i18n, t } = useTranslation();
  return <span title={t('badge.title')}>{i18n.language}</span>;
};`;
    const out = injector.inject(code);

    // 已有 useTranslation()，不应再注入第二个
    const hookCount = (out.match(/useTranslation\(\)/g) || []).length;
    expect(hookCount).toBe(1);
    // 也不应产出会导致重声明的 `const { t } = useTranslation();`
    expect(out).not.toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
  });

  it('const { t, i18n } = useTranslation()（t 首位）仍然不重复注入', () => {
    const injector = buildInjector();
    const code = `const Badge = () => {
  const { t, i18n } = useTranslation();
  return <span title={t('badge.title')}>{i18n.language}</span>;
};`;
    const out = injector.inject(code);
    const hookCount = (out.match(/useTranslation\(\)/g) || []).length;
    expect(hookCount).toBe(1);
  });
});
