import { describe, it, expect } from 'vitest';
import {
  createPluralFormatter,
  createDateFormatter,
  createNumberFormatter,
  createCurrencyFormatter,
} from '../src/use-locale/formatters';

describe('formatters', () => {
  describe('createPluralFormatter', () => {
    it('should format plural in zh-CN', () => {
      const plural = createPluralFormatter('zh-CN');
      const templates = {
        zero: '没有项目',
        one: '{count} 个项目',
        other: '{count} 个项目',
      };

      // 中文的 Intl.PluralRules 只返回 "other"，不支持 "zero" 和 "one"
      expect(plural(0, templates)).toBe('0 个项目');
      expect(plural(1, templates)).toBe('1 个项目');
      expect(plural(5, templates)).toBe('5 个项目');
      expect(plural(100, templates)).toBe('100 个项目');
    });

    it('should format plural in en-US', () => {
      const plural = createPluralFormatter('en-US');
      const templates = {
        one: '{count} item',
        other: '{count} items',
      };

      expect(plural(1, templates)).toBe('1 item');
      expect(plural(2, templates)).toBe('2 items');
      expect(plural(0, templates)).toBe('0 items');
    });
  });

  describe('createDateFormatter', () => {
    const testDate = new Date('2025-01-15T14:30:45');

    it('should format short date', () => {
      const zhDate = createDateFormatter('zh-CN');
      const enDate = createDateFormatter('en-US');

      const zhShort = zhDate.short(testDate);
      const enShort = enDate.short(testDate);

      expect(zhShort).toContain('2025');
      expect(zhShort).toContain('01');
      expect(zhShort).toContain('15');

      expect(enShort).toContain('01');
      expect(enShort).toContain('15');
      expect(enShort).toContain('2025');
    });

    it('should format long date', () => {
      const zhDate = createDateFormatter('zh-CN');
      const longDate = zhDate.long(testDate);

      expect(longDate).toContain('2025');
      expect(longDate).toContain('1');
      expect(longDate).toContain('15');
    });

    it('should format time', () => {
      const date = createDateFormatter('zh-CN');
      const time = date.time(testDate);

      expect(time).toContain('14');
      expect(time).toContain('30');
    });

    it('should format relative time', () => {
      const date = createDateFormatter('zh-CN');

      // 未来 1 小时
      const future = new Date(Date.now() + 60 * 60 * 1000);
      const futureStr = date.relative(future);
      expect(futureStr).toBeTruthy();

      // 过去 1 小时
      const past = new Date(Date.now() - 60 * 60 * 1000);
      const pastStr = date.relative(past);
      expect(pastStr).toBeTruthy();
    });
  });

  describe('createNumberFormatter', () => {
    it('should format decimal', () => {
      const number = createNumberFormatter('zh-CN');

      expect(number.decimal(1234.5678, 2)).toContain('1');
      expect(number.decimal(1234.5678, 2)).toContain('234');
      expect(number.decimal(1234.5678, 0)).not.toContain('.');
    });

    it('should format percent', () => {
      const number = createNumberFormatter('zh-CN');

      const percent = number.percent(0.755);
      expect(percent).toContain('75');
      expect(percent).toContain('%');

      const zeroPercent = number.percent(0);
      expect(zeroPercent).toContain('0');
      expect(zeroPercent).toContain('%');
    });

    it('should format compact number', () => {
      const zhNumber = createNumberFormatter('zh-CN');
      const enNumber = createNumberFormatter('en-US');

      const zhCompact = zhNumber.compact(12000);
      const enCompact = enNumber.compact(12000);

      expect(zhCompact).toBeTruthy();
      expect(enCompact).toBeTruthy();

      // 大数字
      const largeCn = zhNumber.compact(1000000);
      const largeEn = enNumber.compact(1000000);

      expect(largeCn).toBeTruthy();
      expect(largeEn).toBeTruthy();
    });
  });

  describe('createCurrencyFormatter', () => {
    it('should format CNY currency', () => {
      const currency = createCurrencyFormatter('zh-CN');

      const cny = currency(1234.56, 'CNY');
      expect(cny).toContain('1');
      expect(cny).toContain('234');
      expect(cny).toContain('56');
    });

    it('should format USD currency', () => {
      const currency = createCurrencyFormatter('en-US');

      const usd = currency(1234.56, 'USD');
      expect(usd).toContain('1');
      expect(usd).toContain('234');
      expect(usd).toContain('56');
    });

    it('should format EUR currency', () => {
      const currency = createCurrencyFormatter('en-US');

      const eur = currency(1234.56, 'EUR');
      expect(eur).toContain('1');
      expect(eur).toContain('234');
    });

    it('should use CNY as default currency', () => {
      const currency = createCurrencyFormatter('zh-CN');

      const defaultCurrency = currency(100);
      expect(defaultCurrency).toBeTruthy();
      expect(defaultCurrency).toContain('100');
    });
  });
});
