import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';
import { CommonASTUtils } from '../src/utils/common-ast-utils';

/**
 * isAlreadyInternationalized 特征护栏（C：两库共享父链脚手架抽取重构的安全网）。
 * 逐分支断言 react-i18next / react-intl 的「已国际化 / 类型字面量 / 枚举 / 作用域停止」判定，
 * 确保抽取到 CommonASTUtils 后行为完全不变。
 */
const findNode = (code: string, text: string): ts.Node => {
  const sf = CommonASTUtils.parseSourceFile(code, 'probe.tsx');
  let found: ts.Node | undefined;
  const visit = (n: ts.Node): void => {
    if (
      !found &&
      (ts.isStringLiteral(n) || ts.isJsxText(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      n.getText(sf).includes(text)
    ) {
      found = n;
    }
    if (!found) ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) throw new Error(`probe 节点未找到: ${text}`);
  return found;
};

describe('react-i18next.isAlreadyInternationalized', () => {
  const lib = createReactI18nLibrary('react-i18next');
  const check = (code: string, text: string): boolean =>
    lib.isAlreadyInternationalized(findNode(code, text));

  it("t('key') 调用内 → true", () => {
    expect(check(`const a = t('已存在A');`, '已存在A')).toBe(true);
  });
  it('i18next.t(...) 调用内 → true', () => {
    expect(check(`const b = i18next.t('已存在B');`, '已存在B')).toBe(true);
  });
  it('<Trans> 元素内文本 → true', () => {
    expect(check(`const c = <Trans i18nKey="k">已存在C</Trans>;`, '已存在C')).toBe(true);
  });
  it('类型字面量 → true（编译期消费，跳过提取）', () => {
    expect(check(`type T = '已存在D';`, '已存在D')).toBe(true);
  });
  it('枚举成员值 → true', () => {
    expect(check(`enum E { A = '已存在E' }`, '已存在E')).toBe(true);
  });
  it('普通函数体内裸字面量 → false（遇 Block 停止）', () => {
    expect(check(`function C() { const s = '未国际化F'; return s; }`, '未国际化F')).toBe(false);
  });
});

describe('react-intl.isAlreadyInternationalized', () => {
  const lib = createReactI18nLibrary('react-intl');
  const check = (code: string, text: string): boolean =>
    lib.isAlreadyInternationalized(findNode(code, text));

  it('intl.formatMessage(...) 内 → true', () => {
    expect(
      check(`const a = intl.formatMessage({ id: 'x', defaultMessage: '已存在A' });`, '已存在A'),
    ).toBe(true);
  });
  it('defineMessages(...) 内 → true', () => {
    expect(
      check(`const m = defineMessages({ g: { id: 'g', defaultMessage: '已存在B' } });`, '已存在B'),
    ).toBe(true);
  });
  it('<FormattedMessage> 属性内 → true', () => {
    expect(
      check(`const c = <FormattedMessage id="k" defaultMessage="已存在C" />;`, '已存在C'),
    ).toBe(true);
  });
  it('枚举成员值 → true', () => {
    expect(check(`enum E { A = '已存在D' }`, '已存在D')).toBe(true);
  });
  it('普通函数体内裸字面量 → false（遇 Block 停止）', () => {
    expect(check(`function C() { const s = '未国际化E'; return s; }`, '未国际化E')).toBe(false);
  });
});
