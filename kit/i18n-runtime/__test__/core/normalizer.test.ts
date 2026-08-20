import { describe, expect, it } from 'vitest';
import { isTranslatable, normalize } from '../../src/core/normalizer.js';

describe('isTranslatable', () => {
  it('含中文文字应视为可翻译', () => {
    expect(isTranslatable('共 5 条')).toBe(true);
  });

  it('含英文文字应视为可翻译', () => {
    expect(isTranslatable('Hello')).toBe(true);
  });

  it('纯日期应视为不可翻译', () => {
    expect(isTranslatable('2026-07-15')).toBe(false);
  });

  it('纯符号应视为不可翻译', () => {
    expect(isTranslatable('···%100')).toBe(false);
  });

  it('空字符串应视为不可翻译', () => {
    expect(isTranslatable('')).toBe(false);
  });
});

describe('normalize', () => {
  it('应把数字序列替换成占位符', () => {
    const { normalized } = normalize('共 5 条');
    expect(normalized).toBe('共 {N0} 条');
  });

  it('应支持多个数字占位符', () => {
    const { normalized } = normalize('第 3 页，共 12 条');
    expect(normalized).toBe('第 {N0} 页，共 {N1} 条');
  });

  it('restore 应把占位符换回原始数字', () => {
    const { restore } = normalize('共 5 条');
    expect(restore('There are {N0} items')).toBe('There are 5 items');
  });

  it('restore 应支持多个占位符按序回填', () => {
    const { restore } = normalize('第 3 页，共 12 条');
    expect(restore('Page {N0} of {N1} total')).toBe('Page 3 of 12 total');
  });

  it('不含数字的文本 normalize 后应保持不变', () => {
    const { normalized } = normalize('你好世界');
    expect(normalized).toBe('你好世界');
  });

  it('provider 丢失占位符时 restore 不应抛错（已知限制，容忍降级）', () => {
    const { restore } = normalize('共 5 条');
    expect(() => restore('no placeholder here')).not.toThrow();
  });
});
