import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import {
  appendImportLine,
  mergeNamedImport,
  removeNamedImports,
} from '../src/utils/import-surgery';

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
    const out = mergeNamedImport(multiLineWithComment, 'vue-i18n', ['t']);
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
    const out = mergeNamedImport(code, 'vue-i18n', ['t']);
    expect(parseDiagnostics(out)).toHaveLength(0);
    expect(out).not.toContain('组合式');
    expect(out).toContain('t');
  });

  it('removeNamedImports：多行 import 含行注释时摘除后输出为合法语法', () => {
    const out = removeNamedImports(multiLineWithComment, isVueI18n, ['useI18n']);
    expect(parseDiagnostics(out)).toHaveLength(0);
    // useI18n 被摘除，createI18n 保留
    expect(out).not.toContain('useI18n');
    expect(out).toContain('createI18n');
    expect(out).not.toContain('组合式 API');
  });

  it('无注释场景 mergeNamedImport 行为与现状一致（回归）', () => {
    const code = `import { useI18n } from 'vue-i18n';\n`;
    const out = mergeNamedImport(code, 'vue-i18n', ['t']);
    expect(out).toContain(`import { useI18n, t } from 'vue-i18n';`);
  });

  it('无注释场景 removeNamedImports 行为与现状一致（回归）', () => {
    const code = `import { useI18n, createI18n } from 'vue-i18n';\n`;
    const out = removeNamedImports(code, isVueI18n, ['useI18n']);
    expect(out).toContain(`import { createI18n } from 'vue-i18n';`);
  });
});

/**
 * import 定位一律在「掩码文本」上做：注释与模板字符串的内容整体替成等长空格，
 * 匹配到的下标再落回原文改写。注释 / 模板串里的示例 import 因此不再被当成真实语句。
 */
describe('命名导入改写：注释与模板串里的 import 不是语句', () => {
  it('mergeNamedImport：块注释里顶格的 import 不参与合并，真实 import 保留并被合并', () => {
    const code = `/*
import { useI18n } from 'vue-i18n';
*/
import { createI18n } from 'vue-i18n';

const a = 1;
`;
    const out = mergeNamedImport(code, 'vue-i18n', ['useI18n']);
    // 注释原样保留
    expect(out).toContain(`/*\nimport { useI18n } from 'vue-i18n';\n*/`);
    // 真实 import 被合并，且只此一条
    expect(out).toContain(`import { createI18n, useI18n } from 'vue-i18n';`);
    expect(out).toContain('const a = 1;');
  });

  it('removeNamedImports：只摘真实 import，注释里的同名 import 原样保留', () => {
    const code = `/*
import { t } from '@/i18n';
*/
import { t, other } from '@/i18n';
`;
    const out = removeNamedImports(code, (m) => m === '@/i18n', ['t']);
    expect(out).toContain(`/*\nimport { t } from '@/i18n';\n*/`);
    expect(out).toContain(`import { other } from '@/i18n';`);
  });

  it('appendImportLine：锚点不落进块注释内部', () => {
    const code = `import React from 'react';
/*
import { Foo } from './foo';
*/
export const A = 1;
`;
    const out = appendImportLine(code, "import { t } from '@/i18n';");
    const lines = out.split('\n');
    expect(lines[1]).toBe(`import { t } from '@/i18n';`);
  });

  it('appendImportLine：锚点不落进模板字符串内部', () => {
    const code = "import React from 'react';\nconst tpl = `\nimport { X } from 'y';\n`;\n";
    const out = appendImportLine(code, "import { t } from '@/i18n';");
    const lines = out.split('\n');
    expect(lines[1]).toBe(`import { t } from '@/i18n';`);
    // 模板内容不被改动
    expect(out).toContain("`\nimport { X } from 'y';\n`");
  });

  it('mergeNamedImport：命名列表行注释含 `}` 时仍识别为已存在的 import（不追加重复导入）', () => {
    const code = `import {
  useI18n, // 返回 { t }
  createI18n,
} from 'vue-i18n';
`;
    const out = mergeNamedImport(code, 'vue-i18n', ['useI18n']);
    expect(out.match(/from 'vue-i18n'/g)).toHaveLength(1);
    expect(out).toContain(`import { useI18n, createI18n } from 'vue-i18n';`);
  });

  it('removeNamedImports：命名列表行注释含 `}` 时仍能摘除', () => {
    const code = `import {
  useI18n, // 返回 { t }
  createI18n,
} from 'vue-i18n';
`;
    const out = removeNamedImports(code, (m) => m === 'vue-i18n', ['createI18n']);
    expect(out).toContain(`import { useI18n } from 'vue-i18n';`);
    expect(out).not.toContain('createI18n');
  });
});

/**
 * 无既有 import 时的插入位置：指令序言（'use client' 等）必须留在模块最前，
 * 被 import 顶下去即失效；shebang 与文件头注释组同理不能被劈开。
 */
describe('appendImportLine：文件头指令序言与注释组', () => {
  const stmt = "import { t } from '@/i18n';";

  it("'use client' 之后而非之前", () => {
    const out = appendImportLine(`'use client';\n\nexport function A() {}\n`, stmt);
    expect(out.split('\n')[0]).toBe(`'use client';`);
    expect(out).toContain(`'use client';\n${stmt}`);
  });

  it('shebang + "use strict" 之后', () => {
    const out = appendImportLine(`#!/usr/bin/env node\n"use strict";\nconst a = 1;\n`, stmt);
    const lines = out.split('\n');
    expect(lines[0]).toBe('#!/usr/bin/env node');
    expect(lines[1]).toBe('"use strict";');
    expect(lines[2]).toBe(stmt);
  });

  it('文件头块注释之后', () => {
    const out = appendImportLine(`/**\n * 版权\n */\nexport const A = 1;\n`, stmt);
    const lines = out.split('\n');
    expect(lines[2]).toBe(' */');
    expect(lines[3]).toBe(stmt);
  });

  it('无注释无指令时仍插在文件首行（行为不变）', () => {
    const out = appendImportLine(`export const A = 1;\n`, stmt);
    expect(out.split('\n')[0]).toBe(stmt);
  });
});
