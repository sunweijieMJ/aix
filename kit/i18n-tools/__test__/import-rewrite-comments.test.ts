import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { CommonASTUtils } from '../src/utils/common-ast-utils';

/**
 * 回归（Bug2）：多行 import 内带行注释（`useI18n, // 组合式 API`）时，
 * mergeNamedImport / removeNamedImports 直接对花括号内容 split(',') + trim，
 * 会把注释文本并进导入名。重写为单行时首个 `//` 会吞掉后续导入名与 `from`，
 * 产出语法损坏、无法编译的代码。
 *
 * 修复：拆分前先剥离花括号内的 `//...`（到行尾）与 块注释，再解析导入名。
 * 取舍：重写为单行时注释自然丢弃——保语法正确优先于保注释。
 */
describe('命名导入改写：花括号内注释不破坏语法（Bug2）', () => {
  /** 用 TS 解析输出，断言无语法诊断（parseDiagnostics 为空即语法合法）。 */
  const parseDiagnostics = (code: string): readonly ts.Diagnostic[] => {
    const sf = ts.createSourceFile('t.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    // parseDiagnostics 未在公共类型上暴露，运行时确实存在
    return (sf as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  };

  const isVueI18n = (m: string): boolean => m === 'vue-i18n';

  const multiLineWithComment = `import {
  useI18n, // 组合式 API
  createI18n
} from 'vue-i18n';
`;

  it('mergeNamedImport：多行 import 含行注释时输出为合法语法且导入名正确', () => {
    const out = CommonASTUtils.mergeNamedImport(multiLineWithComment, 'vue-i18n', ['t']);
    expect(parseDiagnostics(out)).toHaveLength(0);
    // 注释被丢弃，三个导入名齐全
    expect(out).toContain('useI18n');
    expect(out).toContain('createI18n');
    expect(out).toContain('t');
    // 注释文本不应残留在导入语句里（否则说明未剥离）
    expect(out).not.toContain('组合式 API');
  });

  it('mergeNamedImport：块注释同样被剥离且语法合法', () => {
    const code = `import { useI18n /* 组合式 */, createI18n } from 'vue-i18n';\n`;
    const out = CommonASTUtils.mergeNamedImport(code, 'vue-i18n', ['t']);
    expect(parseDiagnostics(out)).toHaveLength(0);
    expect(out).not.toContain('组合式');
    expect(out).toContain('t');
  });

  it('removeNamedImports：多行 import 含行注释时摘除后输出为合法语法', () => {
    const out = CommonASTUtils.removeNamedImports(multiLineWithComment, isVueI18n, ['useI18n']);
    expect(parseDiagnostics(out)).toHaveLength(0);
    // useI18n 被摘除，createI18n 保留
    expect(out).not.toContain('useI18n');
    expect(out).toContain('createI18n');
    expect(out).not.toContain('组合式 API');
  });

  it('无注释场景 mergeNamedImport 行为与现状一致（回归）', () => {
    const code = `import { useI18n } from 'vue-i18n';\n`;
    const out = CommonASTUtils.mergeNamedImport(code, 'vue-i18n', ['t']);
    expect(out).toContain(`import { useI18n, t } from 'vue-i18n';`);
  });

  it('无注释场景 removeNamedImports 行为与现状一致（回归）', () => {
    const code = `import { useI18n, createI18n } from 'vue-i18n';\n`;
    const out = CommonASTUtils.removeNamedImports(code, isVueI18n, ['useI18n']);
    expect(out).toContain(`import { createI18n } from 'vue-i18n';`);
  });
});
