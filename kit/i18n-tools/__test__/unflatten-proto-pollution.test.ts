import { describe, it, expect } from 'vitest';
import { FileUtils } from '../src/utils/file-utils';

/**
 * 回归：unflattenObject 逐段下钻时用 `current[k] = current[k] || {}`，遇到 `__proto__` 中间段
 * 会读到 Object.prototype 并写穿，污染全局原型。键名可来自手写 locale / CSV 回流等外部来源，
 * 且默认 nested 落盘路径（serialize）会触发。修复：拒绝保留段名 + 用 hasOwnProperty 判容器。
 */
describe('FileUtils.unflattenObject — 原型链污染防护', () => {
  it('含 __proto__ 中间段的键不污染 Object.prototype', () => {
    const result = FileUtils.unflattenObject({ '__proto__.polluted': 'yes' }, '.');
    // 关键：全局原型未被污染
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    // 该非法键被跳过，不出现在结果里
    expect((result as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('constructor / prototype 段名同样被拒绝', () => {
    const result = FileUtils.unflattenObject(
      { 'constructor.x': '1', 'prototype.y': '2', 'a.b': 'ok' },
      '.',
    );
    expect(result).toEqual({ a: { b: 'ok' } });
  });

  it('toString 等原型链属性名作段名不下钻到继承值', () => {
    const result = FileUtils.unflattenObject({ 'toString.x': '1', a: '2' }, '.');
    expect(result.a).toBe('2');
    expect(typeof result.toString).toBe('object');
    expect((result.toString as unknown as Record<string, unknown>).x).toBe('1');
  });

  it('正常嵌套键不受影响', () => {
    const result = FileUtils.unflattenObject(
      { 'views.login.title': '登录', 'views.login.sub': '副' },
      '.',
    );
    expect(result).toEqual({ views: { login: { title: '登录', sub: '副' } } });
  });
});
