import { describe, expect, it } from 'vitest';
import {
  extractScriptContent,
  formatDefaultExpression,
  formatDocgenDefault,
  normalizeTypeText,
} from '../docs/extract-api';

describe('formatDefaultExpression', () => {
  it('保留字符串 / 数字 / 布尔 / null 字面量', () => {
    expect(formatDefaultExpression("'auto'")).toBe("'auto'");
    expect(formatDefaultExpression('"auto"')).toBe("'auto'");
    expect(formatDefaultExpression("''")).toBe("''");
    expect(formatDefaultExpression('3000')).toBe('3000');
    expect(formatDefaultExpression('-1')).toBe('-1');
    expect(formatDefaultExpression('0.5')).toBe('0.5');
    expect(formatDefaultExpression('true')).toBe('true');
    expect(formatDefaultExpression('null')).toBe('null');
  });

  it('展开工厂函数返回的对象与数组字面量', () => {
    expect(formatDefaultExpression('() => ({})')).toBe('{}');
    expect(formatDefaultExpression('() => []')).toBe('[]');
    expect(formatDefaultExpression('() => ([])')).toBe('[]');
    expect(formatDefaultExpression('() => [0.5, 0.75, 1]')).toBe('[0.5, 0.75, 1]');
    expect(formatDefaultExpression("() => ({ a: 1, b: 'x' })")).toBe("{ a: 1, b: 'x' }");
    expect(formatDefaultExpression('function () { return { a: 1 }; }')).toBe('{ a: 1 }');
  });

  it('剥掉 as / satisfies 断言与多余括号', () => {
    expect(formatDefaultExpression("() => ['attach', 'voice'] as SenderToolbarItems")).toBe(
      "['attach', 'voice']",
    );
    expect(formatDefaultExpression("['a'] as const")).toBe("['a']");
    expect(formatDefaultExpression('(((42)))')).toBe('42');
  });

  it('多行字面量压成单行', () => {
    expect(formatDefaultExpression('() => ({\n  a: 1,\n  b: 2,\n})')).toBe('{ a: 1, b: 2, }');
  });

  it('空函数体不当成对象字面量', () => {
    expect(formatDefaultExpression('() => {}')).toBeUndefined();
    expect(formatDefaultExpression('() => { doSomething(); }')).toBeUndefined();
  });

  it('无法静态求值的表达式返回 undefined', () => {
    expect(formatDefaultExpression('undefined')).toBeUndefined();
    expect(formatDefaultExpression('DEFAULT_SIZE')).toBeUndefined();
    expect(formatDefaultExpression('`a${b}`')).toBeUndefined();
    expect(formatDefaultExpression('theme.colorPrimary')).toBeUndefined();
    expect(formatDefaultExpression('() => new Date()')).toBeUndefined();
    expect(formatDefaultExpression('')).toBeUndefined();
  });
});

describe('formatDocgenDefault', () => {
  it('没有值时返回 undefined', () => {
    expect(formatDocgenDefault(undefined)).toBeUndefined();
    expect(formatDocgenDefault({})).toBeUndefined();
  });

  it('取 value 字段按表达式解析', () => {
    expect(formatDocgenDefault({ value: '3000' })).toBe('3000');
    expect(formatDocgenDefault({ value: '() => [1]' })).toBe('[1]');
  });
});

describe('normalizeTypeText', () => {
  it('压缩空白并去掉括号内侧空格', () => {
    expect(normalizeTypeText('Array< string >')).toBe('Array<string>');
    expect(normalizeTypeText("'a'\n  | 'b'")).toBe("'a' | 'b'");
  });

  it('去掉内联导入类型的模块前缀', () => {
    expect(normalizeTypeText("import('./types').MenuItemData")).toBe('MenuItemData');
  });

  it('剥掉注释但不动字符串字面量', () => {
    expect(normalizeTypeText('string /* 说明 */')).toBe('string');
    expect(normalizeTypeText("'//not-a-comment'")).toBe("'//not-a-comment'");
  });

  it('去掉多行联合的前导竖线', () => {
    expect(normalizeTypeText("\n  | 'a'\n  | 'b'")).toBe("'a' | 'b'");
  });
});

describe('extractScriptContent', () => {
  it('setup 块优先于普通 script 块', () => {
    const sfc = [
      '<script lang="ts">export const plain = 1;</script>',
      '<script setup lang="ts">const setupOnly = 2;</script>',
    ].join('\n');
    expect(extractScriptContent(sfc)).toBe('const setupOnly = 2;');
  });

  it('没有 setup 块时退回第一个 script 块', () => {
    expect(extractScriptContent('<script lang="ts">const only = 1;</script>')).toBe(
      'const only = 1;',
    );
  });

  it('没有 script 块时返回空串', () => {
    expect(extractScriptContent('<template><div /></template>')).toBe('');
  });
});
