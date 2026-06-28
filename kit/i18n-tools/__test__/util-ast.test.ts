import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ts from 'typescript';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { BaseTextExtractor } from '../src/strategies/base/text-extractor';
import type { ExtractedString } from '../src/utils/types';
import { compileMatcher } from '../src/utils/path-matcher';
import { BucketResolver } from '../src/utils/bucket-resolver';
import { VueRestoreTransformer } from '../src/strategies/vue/VueRestoreTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import { RestoreProcessor } from '../src/core/RestoreProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

// =============================================================================
// common-ast-utils
// =============================================================================
describe('common-ast-utils', () => {
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

  describe('CommonASTUtils.isExtractableStringLiteral — 计算属性 KEY 排除', () => {
    // 取代码中「指定文本」的字符串字面量节点（按 node.text 精确定位，避免误取同名片段）
    function findStringLiteral(code: string, text: string): ts.StringLiteral {
      const sourceFile = CommonASTUtils.parseSourceFile(code, 'temp.ts');
      let found: ts.StringLiteral | undefined;
      const visit = (n: ts.Node) => {
        if (!found && ts.isStringLiteral(n) && n.text === text) found = n;
        ts.forEachChild(n, visit);
      };
      ts.forEachChild(sourceFile, visit);
      if (!found) throw new Error(`no string literal: ${text}`);
      return found;
    }

    it('计算属性 KEY `{ [‘进行中’]: v }` 不可提取（与非计算 key 对称）', () => {
      const node = findStringLiteral(`const m = { ['进行中']: 1 };`, '进行中');
      expect(CommonASTUtils.isExtractableStringLiteral(node)).toBe(false);
    });

    it('类成员的计算属性名 `class { [‘进行中’]() {} }` 同样不可提取', () => {
      const node = findStringLiteral(`class C { ['进行中']() {} }`, '进行中');
      expect(CommonASTUtils.isExtractableStringLiteral(node)).toBe(false);
    });

    it('非计算对象 key 仍不可提取（既有行为保护）', () => {
      const node = findStringLiteral(`const m = { '进行中': 1 };`, '进行中');
      expect(CommonASTUtils.isExtractableStringLiteral(node)).toBe(false);
    });

    it('计算成员访问 `map[‘进行中’]` 不可提取（既有行为保护）', () => {
      const node = findStringLiteral(`const c = map['进行中'];`, '进行中');
      expect(CommonASTUtils.isExtractableStringLiteral(node)).toBe(false);
    });

    it('普通展示文案仍可提取（不被新规则误伤）', () => {
      const node = findStringLiteral(`const title = '请输入姓名';`, '请输入姓名');
      expect(CommonASTUtils.isExtractableStringLiteral(node)).toBe(true);
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
      const out = CommonASTUtils.mergeNamedImport(code, 'react-i18next', [
        'Trans',
        'useTranslation',
      ]);
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

    it('默认+具名混合 import：并入现有花括号且保留默认导入，不追加重复行（#7）', () => {
      const code = `import locale, { t } from '@/plugins/locale';\n\nconst X = 1;`;
      const out = CommonASTUtils.mergeNamedImport(code, '@/plugins/locale', ['t']);
      // 仍是一条 import（旧实现因 regex 不匹配 default+named 会再追加一行 → 两条）
      expect((out.match(/from '@\/plugins\/locale'/g) || []).length).toBe(1);
      // 默认导入 locale 必须保留
      expect(out).toMatch(/import locale, \{ t \} from '@\/plugins\/locale';/);
    });

    it('默认+具名混合 import：并入新具名项时保留默认导入与既有具名（#7）', () => {
      const code = `import i18n, { useTranslation } from 'react-i18next';\n`;
      const out = CommonASTUtils.mergeNamedImport(code, 'react-i18next', ['Trans']);
      expect((out.match(/from 'react-i18next'/g) || []).length).toBe(1);
      expect(out).toMatch(/import i18n, \{ useTranslation, Trans \} from 'react-i18next';/);
    });
  });

  describe('CommonASTUtils.removeNamedImports', () => {
    const isPkg = (mod: string) => mod === '@/plugins/locale';

    it('独占具名项：整条删除', () => {
      const code = `import { t } from '@/plugins/locale';\nconst x = 1;\n`;
      const out = CommonASTUtils.removeNamedImports(code, isPkg, ['t']);
      expect(out).not.toMatch(/@\/plugins\/locale/);
      expect(out).toContain('const x = 1;');
    });

    it('同行其他具名项：只摘 t，保留其余', () => {
      const code = `import { t, other } from '@/plugins/locale';\n`;
      const out = CommonASTUtils.removeNamedImports(code, isPkg, ['t']);
      expect(out).toMatch(/import \{ other \} from '@\/plugins\/locale';/);
    });

    it('默认+具名混合：摘掉死 t 后保留默认导入 `import locale from pkg`（#7）', () => {
      const code = `import locale, { t } from '@/plugins/locale';\n`;
      const out = CommonASTUtils.removeNamedImports(code, isPkg, ['t']);
      // 旧实现 regex 不匹配 default+named → 死 t 摘不掉、整行残留
      expect(out).toMatch(/import locale from '@\/plugins\/locale';/);
      expect(out).not.toMatch(/\{\s*t\s*\}/);
    });

    it('默认+具名混合且还有其他具名项：保留默认导入与其余具名', () => {
      const code = `import locale, { t, fmt } from '@/plugins/locale';\n`;
      const out = CommonASTUtils.removeNamedImports(code, isPkg, ['t']);
      expect(out).toMatch(/import locale, \{ fmt \} from '@\/plugins\/locale';/);
    });
  });

  describe('CommonASTUtils.isLiteralExpression / evalLiteralExpression（#6）', () => {
    it('单个完整字符串字面量 → 字面量，求值去引号', () => {
      expect(CommonASTUtils.isLiteralExpression(`'保存'`)).toBe(true);
      expect(CommonASTUtils.isLiteralExpression(`"取消"`)).toBe(true);
      expect(CommonASTUtils.evalLiteralExpression(`'保存'`)).toBe('保存');
    });

    it('无插值模板字面量 → 字面量；含插值的模板 → 非字面量', () => {
      expect(CommonASTUtils.isLiteralExpression('`hello`')).toBe(true);
      expect(CommonASTUtils.isLiteralExpression('`${a}-${b}`')).toBe(false);
    });

    it('首尾恰为引号的拼接表达式 → 非字面量（修复点：不再误判）', () => {
      // 旧实现 /^['"`].*['"`]$/ 会误判为字面量，evalLiteralExpression 只切首尾字符
      // → 产出坏文本 `(' + count + '`、真变量 count 丢失。
      expect(CommonASTUtils.isLiteralExpression(`'(' + count + ')'`)).toBe(false);
      expect(CommonASTUtils.isLiteralExpression(`'前缀' + name + '后缀'`)).toBe(false);
    });

    it('常见非字面量形式仍判为变量', () => {
      expect(CommonASTUtils.isLiteralExpression(`count + '%'`)).toBe(false);
      expect(CommonASTUtils.isLiteralExpression(`fn('x')`)).toBe(false);
      expect(CommonASTUtils.isLiteralExpression('count')).toBe(false);
    });

    it('数字/布尔/null/undefined 仍判为字面量', () => {
      expect(CommonASTUtils.isLiteralExpression('42')).toBe(true);
      expect(CommonASTUtils.isLiteralExpression('3.14')).toBe(true);
      expect(CommonASTUtils.isLiteralExpression('true')).toBe(true);
      expect(CommonASTUtils.isLiteralExpression('null')).toBe(true);
    });
  });
});

// =============================================================================
// strip-matched-delimiters
// =============================================================================
/**
 * 回归（B2）：旧的 `replace(/^['"`]|['"`]$/g, '')` 对首尾各无条件删一个引号字符。
 * 提取出的 original / JSX 文本本身不带定界引号，其内容若以 ASCII 引号收尾
 * （如 `点击"提交"`）会被误删 →
 *   - shouldReplaceNode 两侧归一化后不相等 → 替换被静默跳过（locale 写了源码没改）；
 *   - createMessageWithOptions 写出的 locale 值永久丢字符。
 * 修复：stripMatchedDelimiters 仅在首尾为「同一个定界符」时才剥一层。
 */
describe('strip-matched-delimiters', () => {
  describe('CommonASTUtils.stripMatchedDelimiters', () => {
    it('剥成对的同种定界符', () => {
      expect(CommonASTUtils.stripMatchedDelimiters(`'你好'`)).toBe('你好');
      expect(CommonASTUtils.stripMatchedDelimiters(`"你好"`)).toBe('你好');
      expect(CommonASTUtils.stripMatchedDelimiters('`你好`')).toBe('你好');
    });

    it('内容值以 ASCII 引号收尾时不误删（核心修复）', () => {
      expect(CommonASTUtils.stripMatchedDelimiters('点击"提交"')).toBe('点击"提交"');
      expect(CommonASTUtils.stripMatchedDelimiters('"提示"内容')).toBe('"提示"内容');
    });

    it('首尾非同一定界符不剥', () => {
      expect(CommonASTUtils.stripMatchedDelimiters(`'你好"`)).toBe(`'你好"`);
    });

    it('allow 限定只剥反引号：locale 文案路径保留内容里的引号', () => {
      expect(CommonASTUtils.stripMatchedDelimiters('`欢迎${x}`', ['`'])).toBe('欢迎${x}');
      expect(CommonASTUtils.stripMatchedDelimiters('点击"提交"', ['`'])).toBe('点击"提交"');
      expect(CommonASTUtils.stripMatchedDelimiters('"你好"', ['`'])).toBe('"你好"');
    });

    it('长度不足 2 原样返回', () => {
      expect(CommonASTUtils.stripMatchedDelimiters('')).toBe('');
      expect(CommonASTUtils.stripMatchedDelimiters('"')).toBe('"');
    });
  });

  describe('CommonASTUtils.shouldReplaceNode — 内容含 ASCII 引号', () => {
    it('节点源码带定界引号、original 为去定界内容时仍能匹配（修复前返回 false）', () => {
      expect(CommonASTUtils.shouldReplaceNode(`'点击"提交"'`, '点击"提交"', false)).toBe(true);
      expect(CommonASTUtils.shouldReplaceNode(`'"提示"内容'`, '"提示"内容', false)).toBe(true);
    });

    it('普通中文仍正常匹配', () => {
      expect(CommonASTUtils.shouldReplaceNode(`'点击提交'`, '点击提交', false)).toBe(true);
    });
  });

  describe('CommonASTUtils.createMessageWithOptions — locale 值不丢内容引号', () => {
    it('内容边界含 ASCII 引号时原样保留（修复前丢字符）', () => {
      expect(CommonASTUtils.createMessageWithOptions('点击"提交"').message).toBe('点击"提交"');
      expect(CommonASTUtils.createMessageWithOptions('"你好"').message).toBe('"你好"');
    });

    it('反引号模板仍剥定界反引号', () => {
      expect(CommonASTUtils.createMessageWithOptions('`你好`').message).toBe('你好');
    });
  });
});

// =============================================================================
// text-extractor-sticky-regex
// =============================================================================
/**
 * 回归：isRejectedByConfig 对带 g 标志的 filterPattern 会克隆出无状态实例规避 lastIndex 残留，
 * 但只处理 `g` 不处理 `y`(sticky)。sticky 同样在多次 test() 间推进 lastIndex，导致同一输入
 * 交替返回 true/false，过滤判定非确定。修复：global || sticky 时都剥除（replace(/[gy]/g,'')）。
 */
describe('text-extractor-sticky-regex', () => {
  class ProbeExtractor extends BaseTextExtractor {
    constructor(patterns: RegExp[]) {
      super(patterns);
    }
    // 抽象方法占位（本测试不使用文件提取）
    async extractFromFile(): Promise<ExtractedString[]> {
      return [];
    }
    // 暴露 protected 方法供断言
    public probe(text: string): boolean {
      return this.isRejectedByConfig(text);
    }
  }

  describe('BaseTextExtractor.isRejectedByConfig — sticky(y) 正则无状态化', () => {
    it('sticky filterPattern 多次调用同一输入结果稳定（不交替）', () => {
      const ex = new ProbeExtractor([/foo/y]);
      // 修复前：第一次 true（lastIndex 推进到 3），第二次从 index 3 起匹配失败 → false
      expect(ex.probe('foo')).toBe(true);
      expect(ex.probe('foo')).toBe(true);
      expect(ex.probe('foo')).toBe(true);
    });

    it('global filterPattern 同样稳定（既有行为保护）', () => {
      const ex = new ProbeExtractor([/bar/g]);
      expect(ex.probe('bar')).toBe(true);
      expect(ex.probe('bar')).toBe(true);
    });

    it('不命中的输入恒为 false', () => {
      const ex = new ProbeExtractor([/foo/y]);
      expect(ex.probe('xyz')).toBe(false);
      expect(ex.probe('xyz')).toBe(false);
    });
  });
});

// =============================================================================
// path-matcher-stateful-regex
// =============================================================================
/**
 * 回归：compileMatcher 的 RegExp 分支原直接复用同一实例 `match.test(fp)`。matcher 会被缓存后
 * 对多个路径反复调用，带 g/y 标志的 RegExp.test() 会推进 lastIndex，导致对同一路径交替返回
 * true/false（分桶/前缀派生非确定性错配）。修复：编译时剥离 g/y 标志后再 test。
 */
describe('path-matcher-stateful-regex', () => {
  describe('compileMatcher — 带状态正则的稳定性', () => {
    it('带 /g 的正则复用调用结果稳定（不交替）', () => {
      const m = compileMatcher(/src\/views\//g);
      expect(m('src/views/a.vue')).toBe(true);
      expect(m('src/views/a.vue')).toBe(true);
      expect(m('src/views/b.vue')).toBe(true);
      expect(m('src/components/c.vue')).toBe(false);
      expect(m('src/components/c.vue')).toBe(false);
    });

    it('带 /y（sticky）的正则同样稳定', () => {
      const m = compileMatcher(/foo/y);
      expect(m('foo/bar')).toBe(true);
      expect(m('foo/bar')).toBe(true);
    });

    it('无 g/y 标志的正则行为不变', () => {
      const m = compileMatcher(/bar/);
      expect(m('bar')).toBe(true);
      expect(m('xbar')).toBe(true);
      expect(m('baz')).toBe(false);
    });
  });
});

// =============================================================================
// module-resolver
// =============================================================================
describe('module-resolver', () => {
  const baseConfig = {
    defaultBucket: 'common',
    emitManifest: true as const,
    layout: 'by-locale' as const,
  };

  describe('BucketResolver', () => {
    it('glob 字符串匹配', () => {
      const r = new BucketResolver({
        ...baseConfig,
        rules: [{ name: 'order', match: 'src/views/order/**' }],
      });
      expect(r.resolve('src/views/order/list.vue', 'order.list.title', '订单列表')).toBe('order');
      expect(r.resolve('src/views/user/list.vue', 'user.list.title', '用户')).toBe('common');
    });

    it('glob 数组匹配（任一命中）', () => {
      const r = new BucketResolver({
        ...baseConfig,
        rules: [{ name: 'user', match: ['src/views/user/**', 'src/api/user/**'] }],
      });
      expect(r.resolve('src/api/user/auth.ts', 'k', 'v')).toBe('user');
      expect(r.resolve('src/views/user/profile.vue', 'k', 'v')).toBe('user');
      expect(r.resolve('src/views/order/list.vue', 'k', 'v')).toBe('common');
    });

    it('RegExp 匹配', () => {
      const r = new BucketResolver({
        ...baseConfig,
        rules: [{ name: 'admin', match: /\/admin\// }],
      });
      expect(r.resolve('src/views/admin/dashboard.vue', 'k', 'v')).toBe('admin');
      expect(r.resolve('src/views/user.vue', 'k', 'v')).toBe('common');
    });

    it('函数匹配（接收 filePath/key/message）', () => {
      const r = new BucketResolver({
        ...baseConfig,
        rules: [
          {
            name: 'mobile',
            match: (filePath) => filePath.includes('.mobile.'),
          },
        ],
      });
      expect(r.resolve('src/views/list.mobile.vue', 'k', 'v')).toBe('mobile');
      expect(r.resolve('src/views/list.vue', 'k', 'v')).toBe('common');
    });

    it('matchKey 按 key 归属', () => {
      const r = new BucketResolver({
        ...baseConfig,
        rules: [{ name: 'error', matchKey: (key) => key.startsWith('error.') }],
      });
      expect(r.resolve('src/anywhere.ts', 'error.notFound', '未找到')).toBe('error');
      expect(r.resolve('src/anywhere.ts', 'order.list', '订单')).toBe('common');
    });

    it('rules 数组顺序优先（先匹配先归属）', () => {
      const r = new BucketResolver({
        ...baseConfig,
        rules: [
          { name: 'admin', match: 'src/views/admin/**' },
          { name: 'views', match: 'src/views/**' },
        ],
      });
      expect(r.resolve('src/views/admin/x.vue', 'k', 'v')).toBe('admin');
      expect(r.resolve('src/views/order/x.vue', 'k', 'v')).toBe('views');
    });

    it('Windows 风格路径自动规范化为 POSIX', () => {
      const r = new BucketResolver({
        ...baseConfig,
        rules: [{ name: 'order', match: 'src/views/order/**' }],
      });
      expect(r.resolve('src\\views\\order\\list.vue', 'k', 'v')).toBe('order');
    });
  });
});

// =============================================================================
// import-unused-block-scope
// =============================================================================
/**
 * 回归：isImportedNameUnused 的遮蔽判定 scopeDeclaresLocal 把「函数体内任意嵌套块」的
 * const/let 都当成整个函数作用域的声明。于是当 `const { t } = useTranslation()` 写在某个
 * if/块内、而同函数内该块之外另有 `t(...)`（实际指向 module import）时，外部引用被误判为
 * 「被遮蔽」→ 导入被判未使用而删除 → 运行时/编译 t 未定义（TS2304）。
 * 修复：遮蔽判定区分块级作用域——块内 const/let 只遮蔽该块内的引用。
 */
describe('import-unused-block-scope', () => {
  describe('CommonASTUtils.isImportedNameUnused — 块级作用域遮蔽', () => {
    const M = '@/plugins/locale';
    const check = (code: string): boolean =>
      CommonASTUtils.isImportedNameUnused(code, 'f.tsx', M, 't');

    it('块内 const {t} 不遮蔽块外引用 → 导入仍在用（保留）', () => {
      const code = `import { t } from '${M}';
function C(cond: boolean) {
  const label = t('a');
  if (cond) {
    const { t } = useTranslation();
    return t('b');
  }
  return label;
}`;
      expect(check(code)).toBe(false); // 块外 t('a') 是未遮蔽的真实引用
    });

    it('块内 const {t} 仍遮蔽同块内引用 → 该处不算导入引用', () => {
      const code = `import { t } from '${M}';
function C(cond: boolean) {
  if (cond) {
    const { t } = useTranslation();
    return t('only-shadowed');
  }
  return null;
}`;
      expect(check(code)).toBe(true); // 唯一的 t() 引用被同块 const {t} 遮蔽
    });
  });
});

// =============================================================================
// restore-cleanup-import
// =============================================================================
describe('restore-cleanup-import', () => {
  const lib = new VueI18nLibraryImpl();

  describe('VueRestoreTransformer cleanupPluginLocaleImport', () => {
    it('clears import { t } from tImport when restored', () => {
      const code = `<script setup lang="ts">
import { ref } from 'vue';
import { t } from '@/plugins/locale';
const msg = ref(t('k'));
</script>`;
      const out = VueRestoreTransformer.restoreVueFile(
        code,
        { k: '你好' },
        lib,
        '@/plugins/locale',
      );
      expect(out).not.toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
      expect(out).toMatch(/'你好'/);
    });

    it('strips only t from mixed named imports', () => {
      const code = `<script setup>
import { t, i18n } from '@/plugins/locale';
const msg = t('k');
console.log(i18n);
</script>`;
      const out = VueRestoreTransformer.restoreVueFile(
        code,
        { k: '你好' },
        lib,
        '@/plugins/locale',
      );
      expect(out).toMatch(/import\s*\{\s*i18n\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
      expect(out).not.toMatch(/\bt\b\s*,/);
    });

    it('removes both useI18n leftover and module import', () => {
      const code = `<script setup lang="ts">
import { t } from '@/plugins/locale';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const msg = t('k');
</script>`;
      const out = VueRestoreTransformer.restoreVueFile(
        code,
        { k: '你好' },
        lib,
        '@/plugins/locale',
      );
      expect(out).not.toMatch(/import.*vue-i18n/);
      expect(out).not.toMatch(/useI18n\(\)/);
      expect(out).not.toMatch(/import\s*\{\s*t\s*\}/);
    });

    // 守卫：存在「locale 查不到、未被还原」的存活 t() 调用时，不得删除 import（否则未定义 t）
    it('keeps import { t } when an unresolvable t() call survives', () => {
      const code = `<script setup lang="ts">
import { t } from '@/plugins/locale';
const a = t('missing');
</script>`;
      // localeMap 不含 'missing' → 该调用无法还原，原样保留
      const out = VueRestoreTransformer.restoreVueFile(code, {}, lib, '@/plugins/locale');
      expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
      expect(out).toMatch(/t\('missing'\)/);
    });

    it('keeps import when one call resolves and another survives', () => {
      const code = `<script setup lang="ts">
import { t } from '@/plugins/locale';
const a = t('k');
const b = t('missing');
</script>`;
      const out = VueRestoreTransformer.restoreVueFile(
        code,
        { k: '你好' },
        lib,
        '@/plugins/locale',
      );
      expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
      expect(out).toContain('你好'); // 可还原的已替换
      expect(out).toMatch(/t\('missing'\)/); // 存活调用保留
    });

    it('keeps t in mixed named import when a t() call survives', () => {
      const code = `<script setup lang="ts">
import { t, i18n } from '@/plugins/locale';
const a = t('missing');
console.log(i18n);
</script>`;
      const out = VueRestoreTransformer.restoreVueFile(code, {}, lib, '@/plugins/locale');
      // t 与 i18n 都应保留
      expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
      expect(out).toMatch(/import\s*\{[^}]*\bi18n\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    });
  });
});

// =============================================================================
// restore-target-resolve-empty-guard
// =============================================================================
/**
 * 回归（HIGH）：restore 显式传 target 但全部解析为空时，绝不回退到全量扫描。
 *
 * 根因（修复前）：_execute 在 targets.length>0 时调 resolveTargetFiles，后者吞掉
 * 「路径不存在」异常、空目录也返回 []；restoreFiles 用 `targetFiles && targetFiles.length>0`
 * 判断，空数组落入 else 分支扫描整个 config.root。配合 overwrite=true → 就地改写整个项目，
 * 与用户「只还原这几个文件」意图完全相反。
 *
 * 修复：区分 undefined（未传 target → 全量）与 [](传了但解析空 → 只处理空集合 → 早退)。
 */
describe('RestoreProcessor — 显式 target 解析为空不回退全量扫描', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  // 已国际化、可被还原的源文件（若被误扫描+overwrite 会被改回中文）
  const SRC = `<script setup lang="ts">\nimport { t } from '@/locale';\nconst m = t('k');\n</script>\n`;

  const buildConfig = (root: string): ResolvedConfig =>
    resolveConfig({
      root,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/locale' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: {
        sourceDir: path.join(root, 'src'),
        localesDir: path.join(root, 'locale'),
        format: 'flat',
        prettify: false,
      },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-empty-guard-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh-CN.json'), JSON.stringify({ k: '你好' }), 'utf-8');
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('传空目录 + overwrite → 不改写项目里其它文件', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, SRC, 'utf-8');
    const emptyDir = path.join(srcDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });

    await new RestoreProcessor(buildConfig(rootDir), false).execute([emptyDir], undefined, true);

    // A.vue 必须保持国际化形态（若回退全量扫描会被 overwrite 还原成中文）
    expect(fs.readFileSync(file, 'utf-8')).toBe(SRC);
  });

  it('传不存在的路径 + overwrite → 不改写项目里其它文件', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, SRC, 'utf-8');

    await new RestoreProcessor(buildConfig(rootDir), false).execute(
      [path.join(srcDir, 'does-not-exist.vue')],
      undefined,
      true,
    );

    expect(fs.readFileSync(file, 'utf-8')).toBe(SRC);
  });

  it('完全不传 target → 仍按既有语义全量扫描（修复不影响默认行为）', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, SRC, 'utf-8');

    await new RestoreProcessor(buildConfig(rootDir), false).execute([], undefined, true);

    // 未传 target = 全量扫描 → A.vue 被还原为中文
    const out = fs.readFileSync(file, 'utf-8');
    expect(out).toContain('你好');
    expect(out).not.toContain("t('k')");
  });
});
