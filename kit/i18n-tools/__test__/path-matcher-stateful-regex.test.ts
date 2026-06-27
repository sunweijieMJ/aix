import { describe, it, expect } from 'vitest';
import { compileMatcher } from '../src/utils/path-matcher';

/**
 * 回归：compileMatcher 的 RegExp 分支原直接复用同一实例 `match.test(fp)`。matcher 会被缓存后
 * 对多个路径反复调用，带 g/y 标志的 RegExp.test() 会推进 lastIndex，导致对同一路径交替返回
 * true/false（分桶/前缀派生非确定性错配）。修复：编译时剥离 g/y 标志后再 test。
 */
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
