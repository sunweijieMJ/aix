import { describe, it, expect } from 'vitest';
import { BaseTextExtractor } from '../src/strategies/base/text-extractor';
import type { ExtractedString } from '../src/utils/types';

/**
 * 回归：isRejectedByConfig 对带 g 标志的 filterPattern 会克隆出无状态实例规避 lastIndex 残留，
 * 但只处理 `g` 不处理 `y`(sticky)。sticky 同样在多次 test() 间推进 lastIndex，导致同一输入
 * 交替返回 true/false，过滤判定非确定。修复：global || sticky 时都剥除（replace(/[gy]/g,'')）。
 */
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
