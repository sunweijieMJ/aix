import { describe, it, expect } from 'vitest';
import { HooksUtils } from '../src/strategies/react/hooks-utils';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归（审计二轮 #2）：hookUsesTranslationVar 用 ts.forEachChild 递归 hook 第一参数时，
 * 会访问 PropertyAccessExpression 的成员名 `.name`。当接收者 != 翻译变量（socket.t、
 * props.t、data.intl），递归到属性名 `t`/`intl` 时被裸标识符分支误判为「使用了翻译变量」，
 * 进而给一个与 i18n 无关的 hook 的依赖数组注入作用域内不存在的 `t` → 构建期 TS2304 /
 * 运行期 ReferenceError，且发生在工具本不该改动的代码里。
 * 修复：成员访问只递归接收者 node.expression，不把 node.name 当作自由变量引用。
 */
describe('hookUsesTranslationVar 成员名误报（审计 #2）', () => {
  it('react-i18next：props.t(...) 不应把 t 注入无关 hook 的依赖数组', () => {
    const lib = createReactI18nLibrary('react-i18next'); // translationVarName = 't'
    const code = `useEffect(() => { props.t('x'); }, [props]);`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    expect(out).toContain('[props]');
    expect(out).not.toContain('props, t'); // 修复前会变成 [props, t]
  });

  it('react-intl：data.intl 不应把 intl 注入无关 hook 的依赖数组', () => {
    const lib = createReactI18nLibrary('react-intl'); // translationVarName = 'intl'
    const code = `useMemo(() => data.intl, [data]);`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    expect(out).toContain('[data]');
    expect(out).not.toContain('data, intl');
  });

  it('真正使用裸 t() 时仍正确注入依赖', () => {
    const lib = createReactI18nLibrary('react-i18next');
    const code = `useEffect(() => { const s = t('x'); return s; }, [props]);`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    expect(out).toContain('[props, t]');
  });

  it('接收者就是翻译变量 intl.formatMessage 时仍正确注入', () => {
    const lib = createReactI18nLibrary('react-intl');
    const code = `useMemo(() => intl.formatMessage({ id: 'x' }), [a]);`;
    const out = HooksUtils.addTranslationVarToHooksDependencies(code, lib);
    expect(out).toContain('[a, intl]');
  });
});
