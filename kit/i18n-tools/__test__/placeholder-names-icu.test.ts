import { describe, it, expect } from 'vitest';
import { extractPlaceholderNames } from '../src/utils/placeholder-utils';

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

  it('中文字面量花括号（非占位符）不进名集', () => {
    expect(names('包含{大括号}的文本')).toEqual([]);
  });
});
