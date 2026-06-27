import { describe, it, expect } from 'vitest';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import type { ReactI18nLibraryType } from '../src/strategies/react/libraries';

function buildInjector(lib: ReactI18nLibraryType = 'react-i18next') {
  const library = createReactI18nLibrary(lib);
  const importManager = new ReactImportManager('@/i18n', library);
  return new ReactComponentInjector(library, importManager);
}

const count = (s: string, re: RegExp) => (s.match(re) || []).length;

/**
 * 回归 #4：isTranslationAvailableInScope / componentUsesTranslation 旧实现遍历整棵子树、
 * 不在嵌套组件边界停止。于是：
 *  - 外层组件因「内层嵌套组件已 const { t } = useTranslation()」被误判为「t 已可用」→ 跳过注入
 *    → 外层自身的 t('b') 引用未声明标识符（运行时 t is not defined）。
 *  - 反向：外层本身不用 t、仅内层组件用 t 时，外层被误判「需要」→ 多注入一个未用 hook。
 * 修复：someWithinComponentScope 在嵌套可注入组件边界停止下钻；普通回调（useEffect/onClick）
 * 不是边界，仍下钻——注入到外层的 hook 在闭包内可用。
 */
describe('ReactComponentInjector：嵌套组件作用域不串味（回归 #4）', () => {
  it('外层用 t + 内层组件已有 t → 外层仍注入自己的 useTranslation（共 2 个）', () => {
    const code = `const Outer = () => {
  const Inner = () => {
    const { t } = useTranslation();
    return <span>{t('a')}</span>;
  };
  return <div>{t('b')}<Inner /></div>;
};`;
    const out = buildInjector().inject(code);
    // 修复前：外层被跳过 → 只有内层 1 个 useTranslation，外层 t('b') 未声明
    expect(count(out, /useTranslation\(\)/g)).toBe(2);
  });

  it('外层不用 t、仅内层组件用 t → 外层不注入多余 hook（共 1 个）', () => {
    const code = `const Outer = () => {
  const Inner = () => {
    const { t } = useTranslation();
    return <span>{t('a')}</span>;
  };
  return <Inner />;
};`;
    const out = buildInjector().inject(code);
    expect(count(out, /useTranslation\(\)/g)).toBe(1);
  });

  it('无回归：t 仅用于普通回调（非组件函数）时外层仍注入 hook', () => {
    const code = `const C = () => {
  useEffect(() => {
    console.log(t('x'));
  }, []);
  return <div />;
};`;
    const out = buildInjector().inject(code);
    expect(count(out, /useTranslation\(\)/g)).toBe(1);
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\)/);
  });

  it('react-intl：外层用 intl + 内层组件已有 useIntl → 外层仍注入（共 2 个 useIntl）', () => {
    const code = `const Outer = () => {
  const Inner = () => {
    const intl = useIntl();
    return <span>{intl.formatMessage({ id: 'a' })}</span>;
  };
  return <div>{intl.formatMessage({ id: 'b' })}<Inner /></div>;
};`;
    const out = buildInjector('react-intl').inject(code);
    expect(count(out, /useIntl\(\)/g)).toBe(2);
  });
});
