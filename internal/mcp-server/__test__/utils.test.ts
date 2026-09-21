import { describe, expect, it } from 'vitest';
import type { IconIndexItem } from '../src/types/index';
import {
  capitalize,
  cleanDocString,
  deepMerge,
  extractTags,
  getDisplayName,
  safeJsonParse,
} from '../src/utils/index';
import {
  calculateIconSearchScore,
  getIconMatchedFields,
  matchesAllIconTerms,
} from '../src/utils/search-scoring';

describe('Utils', () => {
  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('WORLD')).toBe('WORLD');
      expect(capitalize('')).toBe('');
      expect(capitalize('a')).toBe('A');
    });
  });

  describe('getDisplayName', () => {
    it('should extract display name from package name', () => {
      expect(getDisplayName('@aix/button-component')).toBe('ButtonComponent');
      expect(getDisplayName('simple-component')).toBe('SimpleComponent');
      expect(getDisplayName('@scope/multi-word-component')).toBe('MultiWordComponent');
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"key": "value"}', {})).toEqual({ key: 'value' });
      expect(safeJsonParse('[1, 2, 3]', [])).toEqual([1, 2, 3]);
    });

    it('should return default value for invalid JSON', () => {
      expect(safeJsonParse('invalid json', { default: true })).toEqual({
        default: true,
      });
      expect(safeJsonParse('', [])).toEqual([]);
    });
  });

  describe('deepMerge', () => {
    it('should merge objects deeply', () => {
      const target = {
        a: 1,
        b: { c: 2, d: 3 },
        e: [1, 2],
      };
      const source = {
        b: { c: 4, f: 5 },
        g: 6,
      };

      const result = deepMerge(target, source);
      expect(result).toEqual({
        a: 1,
        b: { c: 4, d: 3, f: 5 },
        e: [1, 2],
        g: 6,
      });
    });

    it('should not mutate original objects', () => {
      const target = { a: { b: 1 } };
      const source = { a: { c: 2 } };

      const result = deepMerge(target, source);
      expect(target.a).toEqual({ b: 1 });
      expect(result.a).toEqual({ b: 1, c: 2 });
    });
  });

  describe('cleanDocString', () => {
    it('should clean JSDoc strings', () => {
      const input = `/**
       * This is a description
       * with multiple lines
       */`;
      const expected = 'This is a description\nwith multiple lines';
      expect(cleanDocString(input)).toBe(expected);
    });

    it('should handle simple comments', () => {
      expect(cleanDocString('/** Simple comment */')).toBe('Simple comment');
      expect(cleanDocString('* Just asterisk')).toBe('Just asterisk');
    });
  });

  describe('extractTags', () => {
    it('should extract @tags from text', () => {
      const text = 'This has @tag1 and @tag2 but not email@domain.com';
      expect(extractTags(text)).toEqual(['tag1', 'tag2']);
    });

    it('should deduplicate tags', () => {
      const text = '@duplicate @tag @duplicate @another';
      expect(extractTags(text)).toEqual(['duplicate', 'tag', 'another']);
    });

    it('should return empty array for no tags', () => {
      expect(extractTags('No tags here')).toEqual([]);
      expect(extractTags('')).toEqual([]);
    });
  });
});

describe('图标搜索评分', () => {
  const icon: IconIndexItem = {
    name: 'IconUserAvatar',
    packageName: '@aix/icons',
    description: '用户头像图标',
    category: '图标',
    iconCategory: 'General',
    tags: ['icon', 'general'],
    keywords: ['user', 'avatar', '用户', '头像'],
  };

  it('多词查询应该按词累加，而不是整串 substring 匹配', () => {
    // 以前整串匹配，"用户 头像" / "user account" 这类很自然的查询一律 0 命中
    const single = calculateIconSearchScore(icon, '用户');
    expect(single).toBeGreaterThan(0);
    expect(calculateIconSearchScore(icon, '用户 头像')).toBeGreaterThan(single);
    expect(calculateIconSearchScore(icon, 'user account')).toBeGreaterThan(0);
  });

  it('完全无关的词仍然是 0 分', () => {
    expect(calculateIconSearchScore(icon, '表格')).toBe(0);
    expect(calculateIconSearchScore(icon, '')).toBe(0);
  });

  it('matchedFields 跨词合并且不重复', () => {
    expect(getIconMatchedFields(icon, '用户 头像').sort()).toEqual(['description', 'keywords']);
  });

  it('matchesAllIconTerms 用于区分全词命中和只沾一个词', () => {
    expect(matchesAllIconTerms(icon, '用户 头像')).toBe(true);
    // avatar 命中、table 不命中：只沾一个词
    expect(matchesAllIconTerms(icon, 'avatar table')).toBe(false);
    expect(matchesAllIconTerms(icon, '')).toBe(false);
  });
});
