import { describe, it, expect } from 'vitest';
import { CommonASTUtils } from '../src/utils/common-ast-utils';

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
