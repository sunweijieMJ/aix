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

describe('CommonASTUtils 占位符花括号转换（B2）', () => {
  it('单花括号 → 双花括号（i18next 系写盘）', () => {
    expect(CommonASTUtils.toDoubleBracePlaceholders('共 {count} 项')).toBe('共 {{count}} 项');
  });

  it('多个占位符全部转换', () => {
    expect(CommonASTUtils.toDoubleBracePlaceholders('{a} 到 {b}')).toBe('{{a}} 到 {{b}}');
  });

  it('双花括号 → 单花括号（i18next 系 restore 归一）', () => {
    expect(CommonASTUtils.toSingleBracePlaceholders('共 {{count}} 项')).toBe('共 {count} 项');
    // 容忍内部空格
    expect(CommonASTUtils.toSingleBracePlaceholders('共 {{ count }} 项')).toBe('共 {count} 项');
  });

  it('往返恒等：单 → 双 → 单', () => {
    const single = '你有 {n} 条来自 {user} 的消息';
    const double = CommonASTUtils.toDoubleBracePlaceholders(single);
    expect(double).toBe('你有 {{n}} 条来自 {{user}} 的消息');
    expect(CommonASTUtils.toSingleBracePlaceholders(double)).toBe(single);
  });

  it('无占位符文本不受影响', () => {
    expect(CommonASTUtils.toDoubleBracePlaceholders('纯文本')).toBe('纯文本');
    expect(CommonASTUtils.toSingleBracePlaceholders('纯文本')).toBe('纯文本');
  });

  it('toDoubleBracePlaceholders 幂等：已是双花括号不再转换（防 apply-plan 双转畸形）', () => {
    const once = CommonASTUtils.toDoubleBracePlaceholders('共 {count} 项');
    expect(once).toBe('共 {{count}} 项');
    // 再转一次（模拟 apply-plan 把已转换的 plan.localeDelta 重新喂入）保持不变
    expect(CommonASTUtils.toDoubleBracePlaceholders(once)).toBe('共 {{count}} 项');
    // 多占位符同样幂等
    expect(CommonASTUtils.toDoubleBracePlaceholders('{{a}} 到 {{b}}')).toBe('{{a}} 到 {{b}}');
  });

  it('相邻占位符正确转换', () => {
    expect(CommonASTUtils.toDoubleBracePlaceholders('{a}{b}')).toBe('{{a}}{{b}}');
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
