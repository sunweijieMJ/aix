import { describe, it, expect } from 'vitest';
import { createReactI18nLibrary } from '../src/strategies/react/libraries';

/**
 * 回归（LOW）：react-i18next 的 defaultValue / defaults 占位符必须用双花括号 `{{name}}`。
 *
 * 根因（修复前）：includeDefaultMessage 时，内联的 defaultValue/defaults 直接复用工具内部
 * 单花括号规范形态 `{name}`，但 i18next 默认插值语法是双花括号——单花括号被当字面量。
 * locale 缺 key 时兜底渲染 defaultValue 会原样显示 `你好 {name}` 而非替换变量。写入 locale
 * 的值本身是双花括号（finalizeLocaleMessage），二者口径不一致。
 *
 * 修复：内联前对 defaultMessage 走 finalizeLocaleMessage（仅把真占位符转双花括号，
 * 字面 `{x}` 不动），与 locale 值口径一致。
 */
describe('react-i18next defaultValue/defaults 占位符双花括号', () => {
  const lib = createReactI18nLibrary('react-i18next');

  it('generateFunctionCall：defaultValue 的占位符转双花括号', () => {
    const values = new Map([['name', 'name']]);
    const out = lib.generateFunctionCall('greet.key', values, true, '你好 {name}', false);
    expect(out).toContain('defaultValue: "你好 {{name}}"');
    // 不残留单花括号占位符
    expect(out).not.toContain('"你好 {name}"');
    // values 映射仍在
    expect(out).toContain('name: name');
  });

  it('generateJSXComponent：defaults 的占位符转双花括号', () => {
    const values = new Map([['count', 'count']]);
    const out = lib.generateJSXComponent('cart.total', values, true, '共 {count} 项');
    expect(out).toContain('defaults={"共 {{count}} 项"}');
    expect(out).not.toContain('defaults={"共 {count} 项"}');
  });

  it('无占位符的默认文案保持不变（不误转字面花括号）', () => {
    const out = lib.generateFunctionCall('hello', undefined, true, '你好世界', false);
    expect(out).toContain('defaultValue: "你好世界"');
  });

  it('正文里的非占位符花括号不被转义/转换（i18next 单花括号即字面量）', () => {
    // {config} 不是 values 里的占位符 → 保持单花括号字面量
    const values = new Map([['name', 'name']]);
    const out = lib.generateFunctionCall('k', values, true, '设置 {config} 给 {name}', false);
    expect(out).toContain('defaultValue: "设置 {config} 给 {{name}}"');
  });
});
