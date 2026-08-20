import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { extractPlaceholderNames } from '../src/utils/placeholder-utils';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import { VueI18nextLibrary } from '../src/strategies/vue/libraries/vue-i18next';
import { ReactI18nextLibrary } from '../src/strategies/react/libraries/react-i18next';
import { ReactIntlLibrary } from '../src/strategies/react/libraries/react-intl';
import type { BaseI18nLibrary } from '../src/strategies/base/i18n-library';

/**
 * 占位符相关行为合集：
 *  - extractPlaceholderNames 顶层参数名提取（含 ICU 深度、双括号、转义边界）
 *  - finalizeLocaleMessage / unescapeLiteralText 的字面量花括号转义往返
 *  - createStringOrTemplateNode 对重复同名占位符的还原
 */

/**
 * 回归（#8）：extractPlaceholderNames 只采集顶层参数名，不把 ICU select/plural
 * 子消息字面量误当占位符。
 *
 * 根因（修复前）：全局正则 /\{\{?\s*([A-Za-z0-9_.-]+)/g 命中每个 `{word`，
 * 把 `{gender, select, male {He} ...}` 里的 He/She/They 也收进名集。由于子消息文本
 * 随语言不同，doctor 的 source/target 名集对比会对每条 select/plural 误报 mismatch。
 */
describe('extractPlaceholderNames — 顶层参数名（ICU 友好）', () => {
  const names = (s: string): string[] => [...extractPlaceholderNames(s)].sort();

  it('vue-i18n / react-intl 单括号 {name}', () => {
    expect(extractPlaceholderNames('共 {count} 件，{name} 你好')).toEqual(
      new Set(['count', 'name']),
    );
  });

  it('i18next 双括号 {{name}}', () => {
    expect(extractPlaceholderNames('total {{count}} items')).toEqual(new Set(['count']));
  });

  it('无占位符 → 空集', () => {
    expect(extractPlaceholderNames('纯文本无变量')).toEqual(new Set());
  });

  it('同名占位符去重', () => {
    expect(extractPlaceholderNames('{x} 和 {x}')).toEqual(new Set(['x']));
  });

  it('简单插值：{name} / {{name}}', () => {
    expect(names('你好 {name}')).toEqual(['name']);
    expect(names('你好 {{name}}')).toEqual(['name']);
    expect(names('{a} 和 {b}')).toEqual(['a', 'b']);
  });

  it('ICU select：只取参数名，丢弃子消息文本（核心修复）', () => {
    expect(names('{gender, select, male {He} female {She} other {They}}')).toEqual(['gender']);
  });

  it('ICU plural：只取参数名，不收 # 分支文本', () => {
    expect(names('{count, plural, one {# item} other {# items}}')).toEqual(['count']);
  });

  it('多个 ICU + 简单插值混合', () => {
    expect(names('{name} 在 {city, select, bj {北京} other {其他}} 有 {n} 条')).toEqual([
      'city',
      'n',
      'name',
    ]);
  });

  it('i18next 非转义插值 {{- value}}：取真实名而非 "-"', () => {
    expect(names('{{- value}}')).toEqual(['value']);
    expect(names('{{-value}}')).toEqual(['value']);
  });

  it('vue-i18n 转义后的字面量花括号不被当占位符（与 literal-braces 对齐）', () => {
    // finalizeLocaleMessage('共 {count} 个{config}项', ['count'], vue-i18n) 的产物
    const escaped = "共 {count} 个{'{'}config{'}'}项";
    expect(names(escaped)).toEqual(['count']);
  });

  it('中文占位符名与英文同等采集（生成端保留中文标识符为占位符名）', () => {
    // 生成端 getVariableNameFromExpression 会为中文变量名写出 `{数量}` 这类真占位符，
    // 与英文 `{braces}` 语法上不可区分；且单花括号库的字面量花括号在写盘时已被
    // finalizeLocaleMessage 转义为 `{'{'}...{'}'}`（见上一用例），工具产出的 locale 不存在
    // 未转义的字面量花括号。故中文名统一按占位符采集，翻译校验才能保护 `{数量}` 不被译掉。
    expect(names('包含{大括号}的文本')).toEqual(['大括号']);
  });
});

/**
 * 回归（Bug 1）：extractPlaceholderNames 新增 usesDoubleBrace 参数——双花括号库
 * （react-i18next / vue-i18next）下，孤立的单花括号 `{word}` 不是插值占位符，只是
 * 字面量文本，不应参与占位符名集采集。此前不区分库语法，单花括号里只要是 ASCII
 * 标识符就会被当占位符，导致「源文中文字面量花括号（空集）↔ 译文英文字面量花括号
 * （非空集）」被判定占位符不匹配，正确的翻译被错误拦截丢弃。
 */
describe('extractPlaceholderNames — usesDoubleBrace 参数（双花括号库单花括号非占位符）', () => {
  it('双花括号库：单花括号内容（含 ASCII）不进名集', () => {
    expect(extractPlaceholderNames('Text containing {braces}', true)).toEqual(new Set());
    expect(extractPlaceholderNames('包含{大括号}的文本', true)).toEqual(new Set());
  });

  it('双花括号库：只有 {{name}} 才是真占位符', () => {
    expect(extractPlaceholderNames('Welcome {{userName}}, {{count}} items', true)).toEqual(
      new Set(['userName', 'count']),
    );
  });

  it('双花括号库：单花括号与真占位符混合，只采真占位符', () => {
    expect(extractPlaceholderNames('共 {{count}} 项，含{说明}文本', true)).toEqual(
      new Set(['count']),
    );
  });

  it('单花括号库（默认 / false）：行为不变，单花括号 ASCII 内容仍算占位符', () => {
    expect(extractPlaceholderNames('Text containing {braces}')).toEqual(new Set(['braces']));
    expect(extractPlaceholderNames('Text containing {braces}', false)).toEqual(new Set(['braces']));
  });
});

/**
 * 文本里的「字面量花括号」不能被运行时当成具名插值占位符。
 *  - 单花括号库（vue-i18n / react-intl，单 `{` 即插值）：字面量花括号需转义。
 *  - 双花括号库（react-i18next / vue-i18next，单 `{` 即字面量）：字面量保持单花括号，
 *    且只把**真占位符**转双花括号，不能把文本里的 `{config}` 误转成 `{{config}}`。
 * finalizeLocaleMessage 写盘定稿、unescapeLiteralText restore 还原，二者对称。
 */
describe('字面量花括号处理（finalizeLocaleMessage / escape-unescape）', () => {
  const libs: Record<string, BaseI18nLibrary> = {
    'vue-i18n': new VueI18nLibraryImpl(),
    'vue-i18next': new VueI18nextLibrary(),
    'react-i18next': new ReactI18nextLibrary(),
    'react-intl': new ReactIntlLibrary(),
  };

  const cases: Array<{ msg: string; names: string[] }> = [
    { msg: '包含{大括号}的文本', names: [] }, // 纯文本字面量花括号
    { msg: '共 {count} 个{config}项', names: ['count'] }, // 真占位符 + 字面量
    { msg: '共 {count} 项', names: ['count'] }, // 仅真占位符（回归）
    { msg: '无花括号文本', names: [] },
  ];

  for (const [libName, lib] of Object.entries(libs)) {
    describe(libName, () => {
      for (const { msg, names } of cases) {
        it(`往返无损: ${msg}`, () => {
          const finalized = CommonASTUtils.finalizeLocaleMessage(msg, names, lib);
          const single = lib.usesDoubleBracePlaceholders
            ? CommonASTUtils.toSingleBracePlaceholders(finalized)
            : finalized;
          expect(lib.unescapeLiteralText(single)).toBe(msg);
        });
      }
    });
  }

  it('双花括号库：只转真占位符，不误转文本里的 {config}', () => {
    const lib = new ReactI18nextLibrary();
    const out = CommonASTUtils.finalizeLocaleMessage('共 {count} 个{config}项', ['count'], lib);
    expect(out).toBe('共 {{count}} 个{config}项'); // count→双；config 保持单（i18next 字面量）
  });

  it("vue-i18n：纯文本字面量花括号转义为 {'{'} / {'}' }", () => {
    const lib = new VueI18nLibraryImpl();
    const out = CommonASTUtils.finalizeLocaleMessage('包含{大括号}的文本', [], lib);
    expect(out).toBe("包含{'{'}大括号{'}'}的文本");
  });

  it("react-intl：纯文本字面量花括号转义为 ICU '{' / '}'", () => {
    const lib = new ReactIntlLibrary();
    const out = CommonASTUtils.finalizeLocaleMessage('包含{大括号}的文本', [], lib);
    expect(out).toBe("包含'{'大括号'}'的文本");
  });

  it('doctor 占位符提取不把转义后的字面量误判为占位符', () => {
    // vue-i18n 转义后的值里只应识别出真占位符 count，不应出现 大括号 / config
    const lib = new VueI18nLibraryImpl();
    const value = CommonASTUtils.finalizeLocaleMessage('共 {count} 个{config}项', ['count'], lib);
    const names = extractPlaceholderNames(value);
    expect(names.has('count')).toBe(true);
    expect(names.has('config')).toBe(false);
    expect([...names]).toEqual(['count']);
  });
});

/**
 * 回归：同一变量在文案中重复出现（`欢迎 ${name}，再次问候 ${name}`）时，generate 侧
 * placeholderMap 以表达式为 key，values 只含 1 项，但 message 含 2 个同名占位符。
 *
 * 此前 createStringOrTemplateNode 用「占位符出现次数 !== values 数」判失配，误把整段当字面串
 * 返回 → 运行时变量永久丢失。修复改为按「唯一占位符名」比对。
 */
const printNode = (node: ts.Node): string => {
  const printer = ts.createPrinter();
  const sf = ts.createSourceFile('x.ts', '', ts.ScriptTarget.Latest);
  return printer.printNode(ts.EmitHint.Unspecified, node, sf);
};

describe('CommonASTUtils.createStringOrTemplateNode 重复占位符', () => {
  it('同名占位符重复出现 → 重建为模板字面量，保留变量插值', () => {
    const messageText = '欢迎 {name1}，再次问候 {name1}';
    const values = {
      name1: { node: ts.factory.createIdentifier('name'), text: 'name' },
    };

    const node = CommonASTUtils.createStringOrTemplateNode(messageText, values);

    // 不应退化为纯字符串字面量
    expect(ts.isStringLiteral(node)).toBe(false);
    expect(ts.isTemplateExpression(node)).toBe(true);

    // 直接核对 AST：head + 两个 span（同名变量各插值一次），字面段保留原中文
    const tpl = node as ts.TemplateExpression;
    expect(tpl.head.text).toBe('欢迎 ');
    expect(tpl.templateSpans).toHaveLength(2);
    expect(tpl.templateSpans.map((s) => (s.expression as ts.Identifier).text)).toEqual([
      'name',
      'name',
    ]);
    expect(tpl.templateSpans[0]!.literal.text).toBe('，再次问候 ');
    expect(tpl.templateSpans[1]!.literal.text).toBe('');

    // 打印产物含两处 ${name} 插值（非字面 {name1}）
    const printed = printNode(node);
    expect(printed.match(/\$\{name\}/g)?.length).toBe(2);
    expect(printed).not.toContain('{name1}');
  });

  it('占位符与 values 真不匹配时仍按唯一名判失配 → 返回字面串', () => {
    const messageText = 'a {x} b {y}';
    const values = {
      x: { node: ts.factory.createIdentifier('x'), text: 'x' },
      // 缺 y
    };
    const node = CommonASTUtils.createStringOrTemplateNode(messageText, values);
    expect(ts.isStringLiteral(node)).toBe(true);
    expect((node as ts.StringLiteral).text).toBe(messageText);
  });
});

/**
 * Bug：占位符名字符集不对称——生成端 getVariableNameFromExpression 有意保留中文
 * 标识符（一-鿿，中文变量名是合法 JS），locale 会写入 `共{{数量}}个`；但还原端
 * PLACEHOLDER_NAME 与本文件 IDENT_RE 只认 ASCII，导致双花括号库往返丢变量、
 * doctor/translate 对中文占位符失明。三处字符集必须对齐。
 */
describe('中文占位符名（字符集与生成端对齐）', () => {
  it('extractPlaceholderNames：双花括号库采集中文占位符名', () => {
    expect(extractPlaceholderNames('共{{数量}}个', true)).toEqual(new Set(['数量']));
  });

  it('extractPlaceholderNames：单花括号库采集中文占位符名', () => {
    expect(extractPlaceholderNames('共{数量}个', false)).toEqual(new Set(['数量']));
  });
});
