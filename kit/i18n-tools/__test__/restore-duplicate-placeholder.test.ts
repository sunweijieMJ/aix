import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { CommonASTUtils } from '../src/utils/common-ast-utils';

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
