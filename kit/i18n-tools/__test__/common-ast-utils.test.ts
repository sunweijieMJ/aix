import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { CommonASTUtils } from '../src/utils/common-ast-utils';

describe('CommonASTUtils.nodeToText', () => {
  function findFirstStringLiteral(code: string): {
    node: ts.StringLiteral;
    sourceFile: ts.SourceFile;
  } {
    const sourceFile = CommonASTUtils.parseSourceFile(code, 'temp.ts');
    let found: ts.StringLiteral | undefined;
    const visit = (n: ts.Node) => {
      if (!found && ts.isStringLiteral(n)) found = n;
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(sourceFile, visit);
    if (!found) throw new Error('no string literal');
    return { node: found, sourceFile };
  }

  it('带前导块注释的字面量：只返回字面量本身，不含注释（回归 B1）', () => {
    // getFullStart 会把前导注释一并纳入，导致 shouldReplaceNode 比较失败、
    // 提取出 key 却跳过源码替换。nodeToText 必须用 getStart 跳过 trivia。
    const { node, sourceFile } = findFirstStringLiteral(`const msg = /* greeting */ '你好';`);
    expect(CommonASTUtils.nodeToText(node, sourceFile)).toBe(`'你好'`);
  });

  it('带前导行注释的字面量：同样不含注释', () => {
    const { node, sourceFile } = findFirstStringLiteral(`const msg =\n  // greeting\n  '你好';`);
    expect(CommonASTUtils.nodeToText(node, sourceFile)).toBe(`'你好'`);
  });
});

describe('CommonASTUtils.findLastImportLineIndex', () => {
  it('单行 import：返回该 import 行号', () => {
    const lines = [`import { t } from '@/i18n';`, `const x = 1;`];
    expect(CommonASTUtils.findLastImportLineIndex(lines)).toBe(0);
  });

  it('多个连续 import：返回最后一行', () => {
    const lines = [
      `import a from 'a';`,
      `import b from 'b';`,
      `import c from 'c';`,
      `const x = 1;`,
    ];
    expect(CommonASTUtils.findLastImportLineIndex(lines)).toBe(2);
  });

  it('跨行 import（多行命名导入）：返回 brace 闭合行', () => {
    const lines = [`import {`, `  A,`, `  B,`, `} from 'x';`, `const x = 1;`];
    expect(CommonASTUtils.findLastImportLineIndex(lines)).toBe(3);
  });

  it('import 路径含 { } 字符（字符串内括号）：不应破坏深度追踪', () => {
    // 字符串内的 { } 必须被跳过，否则 import 边界追踪错位
    const lines = [`import { t } from '@/i18n{mock}';`, `const x = 1;`];
    expect(CommonASTUtils.findLastImportLineIndex(lines)).toBe(0);
  });

  it('跨行 import 收尾行字符串内含 } ：仍能正确闭合', () => {
    // 字符串 'x/}weird' 内的 } 不能被计入大括号深度，否则会让深度变成 -1，
    // pendingDepth === 0 的判定提前/错位失败。
    const lines = [`import {`, `  A,`, `} from 'x/}weird';`, `const x = 1;`];
    expect(CommonASTUtils.findLastImportLineIndex(lines)).toBe(2);
  });

  it('无 import：返回 -1', () => {
    expect(CommonASTUtils.findLastImportLineIndex([`const x = 1;`])).toBe(-1);
  });

  it('appendImportLine 在含特殊路径 import 之后插入正确位置', () => {
    const code = `import { t } from '@/i18n{mock}';\nconst x = 1;`;
    const result = CommonASTUtils.appendImportLine(code, `import foo from 'foo';`);
    const expected = [
      `import { t } from '@/i18n{mock}';`,
      `import foo from 'foo';`,
      `const x = 1;`,
    ].join('\n');
    expect(result).toBe(expected);
  });
});

describe('CommonASTUtils 占位符花括号归一（toSingleBracePlaceholders）', () => {
  it('双花括号 → 单花括号（i18next 系 restore 归一）', () => {
    expect(CommonASTUtils.toSingleBracePlaceholders('共 {{count}} 项')).toBe('共 {count} 项');
    // 容忍内部空格
    expect(CommonASTUtils.toSingleBracePlaceholders('共 {{ count }} 项')).toBe('共 {count} 项');
  });

  it('多占位符 / 相邻占位符全部归一', () => {
    expect(CommonASTUtils.toSingleBracePlaceholders('你有 {{n}} 条来自 {{user}} 的消息')).toBe(
      '你有 {n} 条来自 {user} 的消息',
    );
    expect(CommonASTUtils.toSingleBracePlaceholders('{{a}}{{b}}')).toBe('{a}{b}');
  });

  it('无占位符文本不受影响', () => {
    expect(CommonASTUtils.toSingleBracePlaceholders('纯文本')).toBe('纯文本');
  });
});

describe('CommonASTUtils.stripComments', () => {
  it('剥除行注释保留字符串字面量', () => {
    const out = CommonASTUtils.stripComments(`const a = t('foo'); // t('comment')`);
    expect(out).toContain(`t('foo')`);
    expect(out).not.toContain(`t('comment')`);
  });

  it('剥除块注释', () => {
    const out = CommonASTUtils.stripComments(`/* t('skip') */ const a = t('keep');`);
    expect(out).not.toContain(`t('skip')`);
    expect(out).toContain(`t('keep')`);
  });

  it('剥除 HTML 注释', () => {
    const out = CommonASTUtils.stripComments(
      `<template><!-- {{ t('skip') }} --><div>{{ t('keep') }}</div></template>`,
    );
    expect(out).not.toContain(`t('skip')`);
    expect(out).toContain(`t('keep')`);
  });
});

describe('CommonASTUtils.processTemplateExpression - 嵌套中文检测', () => {
  function findTemplateExpression(code: string): {
    node: ts.TemplateExpression;
    sourceFile: ts.SourceFile;
  } {
    const sourceFile = CommonASTUtils.parseSourceFile(code, 'temp.ts');
    let found: ts.TemplateExpression | undefined;
    const visit = (n: ts.Node) => {
      if (!found && ts.isTemplateExpression(n)) found = n;
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(sourceFile, visit);
    if (!found) throw new Error('no template expression');
    return { node: found, sourceFile };
  }

  it('三元分支中的中文（展示文案）被收集到 nestedChineseTexts', () => {
    const { node, sourceFile } = findTemplateExpression(
      "const x = `操作失败：${cond ? '内部错误' : '网络异常'}`;",
    );
    const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
    // 占位符化：处理后文案为 `操作失败：${...}`（变量整体占位）
    expect(result.templateVariables.length).toBe(1);
    // 关键：两个中文分支被收集供诊断，而非静默丢失
    expect(result.nestedChineseTexts).toEqual(['内部错误', '网络异常']);
  });

  it('比较操作数中的中文不计入（由 hardcoded-comparison 单独诊断）', () => {
    const { node, sourceFile } = findTemplateExpression(
      "const x = `状态：${status === '已完成' ? a : b}`;",
    );
    const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
    // '已完成' 是 === 操作数，不算泄漏的展示文案
    expect(result.nestedChineseTexts).toEqual([]);
  });

  it('纯变量插值（无嵌套中文）：nestedChineseTexts 为空', () => {
    const { node, sourceFile } = findTemplateExpression('const x = `欢迎 ${userName} 回来`;');
    const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
    expect(result.nestedChineseTexts).toEqual([]);
  });

  it('字面量插值被内联进文案，不算嵌套泄漏', () => {
    const { node, sourceFile } = findTemplateExpression("const x = `从 ${'开始'} 到 ${'结束'}`;");
    const result = CommonASTUtils.processTemplateExpression(node, sourceFile);
    // 字面量被内联进 processedText（会进 locale 并被翻译），不属于泄漏
    expect(result.processedText).toContain('开始');
    expect(result.processedText).toContain('结束');
    expect(result.nestedChineseTexts).toEqual([]);
  });
});

describe('CommonASTUtils.isImportedNameUnused（作用域遮蔽判定）', () => {
  const M = '@/plugins/locale';
  const check = (code: string) => CommonASTUtils.isImportedNameUnused(code, 'f.tsx', M, 't');

  it('组件内声明同名局部 t 遮蔽了导入 t → 未使用=true', () => {
    const code = `import { t } from '${M}';
function C() {
  const { t } = useTranslation();
  return t('a');
}`;
    expect(check(code)).toBe(true);
  });

  it('类组件 render 内 const { t } = this.props 遮蔽 → 未使用=true', () => {
    const code = `import { t } from '${M}';
class C extends Component {
  render() {
    const { t } = this.props;
    return t('a');
  }
}`;
    expect(check(code)).toBe(true);
  });

  it('模块级使用 t（无遮蔽）→ 未使用=false（保留导入）', () => {
    const code = `import { t } from '${M}';
const x = t('a');
function C() {
  const { t } = useTranslation();
  return t('b');
}`;
    expect(check(code)).toBe(false);
  });

  it('重命名导入 t as tr：注入的 const { t } 不遮蔽 tr → 未使用=false', () => {
    const code = `import { t as tr } from '${M}';
function C() {
  const { t } = useTranslation();
  return tr('a');
}`;
    expect(check(code)).toBe(false);
  });

  it('解构重命名 const { t: hook } 不遮蔽导入 t → 未使用=false', () => {
    const code = `import { t } from '${M}';
function C() {
  const { t: hook } = useTranslation();
  return t('a');
}`;
    expect(check(code)).toBe(false);
  });

  it('对象字面量简写 { t } 是真实值引用 → 未使用=false', () => {
    const code = `import { t } from '${M}';
function C() {
  const { t } = useTranslation();
  const obj = { t };
  return obj;
}`;
    // 顶层无引用，但组件内 { t } 简写引用的是被遮蔽的局部 t，导入 t 仍未被使用
    expect(check(code)).toBe(true);
  });

  it('属性访问 obj.t 不算对导入 t 的引用 → 未使用=true', () => {
    const code = `import { t } from '${M}';
const obj = { t: 1 };
function C() {
  const { t } = useTranslation();
  return obj.t + t('a');
}`;
    expect(check(code)).toBe(true);
  });

  it('无 tImport 的 t 导入 → 返回 false（无可清理）', () => {
    const code = `import { useTranslation } from 'react-i18next';
function C() { const { t } = useTranslation(); return t('a'); }`;
    expect(check(code)).toBe(false);
  });
});

describe('CommonASTUtils.mergeNamedImport', () => {
  it('已存在同包 import：幂等去重，不重复注入', () => {
    const code = `import React from 'react';\nimport { Trans } from 'react-i18next';\n\nconst X = 1;`;
    const out = CommonASTUtils.mergeNamedImport(code, 'react-i18next', ['Trans', 'useTranslation']);
    expect(out).toMatch(/import \{ Trans, useTranslation \} from 'react-i18next';/);
    // 只有一条 react-i18next import
    expect((out.match(/from 'react-i18next'/g) || []).length).toBe(1);
  });

  it('无同包 import：新增一行', () => {
    const code = `import React from 'react';\n\nconst X = 1;`;
    const out = CommonASTUtils.mergeNamedImport(code, 'react-i18next', ['Trans']);
    expect(out).toMatch(/import \{ Trans \} from 'react-i18next';/);
  });

  it('注释中含 import 字样：不得误伤真实 import（Bug #8）', () => {
    // 注释里的 import 字样（无分号，是真 import 的子串）曾导致 String.replace 把真 import 抠成 `;`
    const code = [
      `import React from 'react';`,
      `import { Trans, useTranslation } from 'react-i18next';`,
      `// 顶部已有 \`import { Trans, useTranslation } from 'react-i18next'\``,
      ``,
      `const X = 1;`,
    ].join('\n');
    const out = CommonASTUtils.mergeNamedImport(code, 'react-i18next', ['Trans']);
    // 真实 import 完好（不被损坏成裸 `;`），且仍是一条
    expect(out).toMatch(/^import \{ Trans, useTranslation \} from 'react-i18next';$/m);
    expect(out).not.toMatch(/^;$/m);
  });

  it('字符串字面量中含 import 字样：同样不误伤', () => {
    const code = [
      `import { Trans } from 'react-i18next';`,
      `const tip = "import { Trans } from 'react-i18next'";`,
    ].join('\n');
    const out = CommonASTUtils.mergeNamedImport(code, 'react-i18next', ['Trans']);
    expect(out).toMatch(/^import \{ Trans \} from 'react-i18next';$/m);
    // 字符串字面量原样保留
    expect(out).toContain(`const tip = "import { Trans } from 'react-i18next'";`);
  });
});
