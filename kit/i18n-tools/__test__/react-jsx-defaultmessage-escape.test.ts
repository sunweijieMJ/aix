import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归：includeDefaultMessage 开启时，generateJSXComponent 把默认消息注入 JSX 属性。
 *
 * 旧实现直接 `defaults=${JSON.stringify(msg)}` / `defaultMessage=${JSON.stringify(msg)}`，
 * 即把 JS 字符串字面量（内部 " 转义为 \"、换行为 \n）当作 JSX 属性值。但 JSX 属性值是
 * HTML 风格、不解析反斜杠转义：文本含 " 时 `defaults="他说\"你好\""` 会在第二个 " 处提前
 * 闭合属性 → 整文件 JSX 语法错误；含换行则残留字面 \n。
 *
 * 修复：经 JSX 表达式容器 `{...}` 注入（`defaults={"..."}`），让值按 JS 字符串字面量解析。
 * 注意函数调用路径（generateFunctionCall 的 `{ defaultValue: ... }`）本就是 JS 对象上下文、
 * 一直正确，此处只针对 JSX 属性路径。
 */
describe('React JSX defaultMessage — 属性转义（含双引号/换行不产出非法 JSX）', () => {
  // 把 JSX 片段包成可解析的 tsx 源，返回 TypeScript 解析期诊断（语法错误）数量。
  const jsxSyntaxErrors = (jsx: string): number => {
    const src = ts.createSourceFile(
      'probe.tsx',
      `const __probe = ${jsx};\n`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    // parseDiagnostics 未在公开类型上暴露，但运行时存在。
    return (src as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length;
  };

  it('合法基线：本身就合法的 JSX 探针无语法错误', () => {
    expect(jsxSyntaxErrors('<Trans i18nKey="k" />')).toBe(0);
  });

  it('[react-i18next] 默认消息含双引号 → defaults 用 {} 容器包裹且 JSX 合法', () => {
    const lib = createReactI18nLibrary('react-i18next');
    const out = lib.generateJSXComponent('k', undefined, true, '他说"你好"');
    expect(out).toContain('defaults={');
    // 不能是裸属性字符串形式
    expect(out).not.toMatch(/defaults="/);
    expect(jsxSyntaxErrors(out)).toBe(0);
  });

  it('[react-intl] 默认消息含双引号/换行 → defaultMessage 用 {} 容器包裹且 JSX 合法', () => {
    const lib = createReactI18nLibrary('react-intl');
    const out = lib.generateJSXComponent('k', undefined, true, '行1"引"\n行2');
    expect(out).toContain('defaultMessage={');
    expect(out).not.toMatch(/defaultMessage="/);
    expect(jsxSyntaxErrors(out)).toBe(0);
  });

  it('普通文本（无特殊字符）也保持合法', () => {
    const i18next = createReactI18nLibrary('react-i18next');
    const intl = createReactI18nLibrary('react-intl');
    expect(jsxSyntaxErrors(i18next.generateJSXComponent('k', undefined, true, '保存'))).toBe(0);
    expect(jsxSyntaxErrors(intl.generateJSXComponent('k', undefined, true, '保存'))).toBe(0);
  });
});
