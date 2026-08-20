import { describe, it, expect } from 'vitest';
import { createLruCache } from '../src/utils/lruCache';

describe('createLruCache', () => {
  it('越界淘汰最久未访问项，get 命中刷新热度', () => {
    const c = createLruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // a 刷新热度，b 变最旧
    c.set('c', 3); // 淘汰 b
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
  });

  it('has 命中同样刷新热度（集合语义）', () => {
    const c = createLruCache<string, true>(2);
    c.set('a', true);
    c.set('b', true);
    expect(c.has('a')).toBe(true); // a 刷新热度
    c.set('c', true); // 淘汰 b
    expect(c.has('b')).toBe(false);
    expect(c.has('a')).toBe(true);
  });

  // 回归：get 曾按 value !== undefined 判存——V 含 undefined 的消费方命中时
  // 既不刷热度也与 miss 无法区分，违反接口「命中刷新热度」的承诺
  it('value 为 undefined 的项 get 命中仍刷新热度', () => {
    const c = createLruCache<string, number | undefined>(2);
    c.set('a', undefined);
    c.set('b', 2);
    c.get('a'); // 命中 undefined 值项：必须刷新热度，b 变最旧
    c.set('c', 3); // 淘汰 b 而非 a
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
  });

  it('delete / clear 生效', () => {
    const c = createLruCache<string, number>(4);
    c.set('a', 1);
    expect(c.delete('a')).toBe(true);
    expect(c.get('a')).toBeUndefined();
    c.set('b', 2);
    c.clear();
    expect(c.has('b')).toBe(false);
  });
});
