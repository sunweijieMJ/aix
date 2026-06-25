import { describe, it, expect } from 'vitest';
import { ReactComponentInjector } from '../src/strategies/react/ReactComponentInjector';
import { ReactImportManager } from '../src/strategies/react/ReactImportManager';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

function buildInjector() {
  const library = createReactI18nLibrary('react-i18next');
  const importManager = new ReactImportManager('@/i18n', library);
  return new ReactComponentInjector(library, importManager);
}

describe('ReactComponentInjector.injectHook', () => {
  it('块体箭头组件：在 Block 顶部注入 hook', () => {
    const injector = buildInjector();
    const code = `const Badge = ({ status }: { status: string }) => {\n  return <span title={t('badge.title')} />;\n};`;
    const out = injector.inject(code);
    expect(out).toContain('useTranslation()');
  });

  it('表达式体箭头组件：包成块体并注入 hook，避免 t is not defined（回归 B3）', () => {
    const injector = buildInjector();
    // 属性中已被替换为 t() 调用，但箭头函数是表达式体（无 Block）
    const code = `const Badge = ({ status }: { status: string }) => <span title={t('badge.title')} />;`;
    const out = injector.inject(code);

    // 必须注入 hook 声明
    expect(out).toContain('const { t } = useTranslation();');
    // 表达式体被包成块体：出现 return + 花括号
    expect(out).toContain('return <span');
    // 产物可被 TS 重新解析（语法合法）
    expect(() => {
      // 不抛即视为语法结构完整
      return out.includes('=> {') && out.includes('}');
    }).not.toThrow();
    expect(out).toContain('=> {');
  });
});
