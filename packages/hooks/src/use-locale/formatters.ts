import type {
  Locale,
  DateFormatter,
  NumberFormatter,
  PluralFormatter,
  CurrencyFormatter,
} from './types';

/**
 * 创建复数格式化器
 * 使用浏览器原生 Intl.PluralRules API
 */
export function createPluralFormatter(locale: Locale): PluralFormatter {
  const pluralRules = new Intl.PluralRules(locale);

  return (count: number, templates: Record<string, string>) => {
    const rule = pluralRules.select(count);
    const template =
      templates[rule] || templates.other || templates.one || String(count);
    return template.replace(/\{count\}/g, String(count));
  };
}

/**
 * 创建日期格式化器
 * 使用浏览器原生 Intl.DateTimeFormat API
 */
export function createDateFormatter(locale: Locale): DateFormatter {
  return {
    short: (date: Date) => {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    },
    long: (date: Date) => {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      }).format(date);
    },
    time: (date: Date) => {
      return new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date);
    },
    relative: (date: Date) => {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      const diff = date.getTime() - Date.now();
      const absDiff = Math.abs(diff);

      // 分钟
      if (absDiff < 1000 * 60 * 60) {
        const minutes = Math.round(diff / (1000 * 60));
        return rtf.format(minutes, 'minute');
      }

      // 小时
      if (absDiff < 1000 * 60 * 60 * 24) {
        const hours = Math.round(diff / (1000 * 60 * 60));
        return rtf.format(hours, 'hour');
      }

      // 天
      if (absDiff < 1000 * 60 * 60 * 24 * 30) {
        const days = Math.round(diff / (1000 * 60 * 60 * 24));
        return rtf.format(days, 'day');
      }

      // 月
      const months = Math.round(diff / (1000 * 60 * 60 * 24 * 30));
      return rtf.format(months, 'month');
    },
  };
}

/**
 * 创建数字格式化器
 * 使用浏览器原生 Intl.NumberFormat API
 */
export function createNumberFormatter(locale: Locale): NumberFormatter {
  return {
    decimal: (num: number, digits = 2) => {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(num);
    },
    percent: (num: number) => {
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(num);
    },
    compact: (num: number) => {
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        compactDisplay: 'short',
      }).format(num);
    },
  };
}

/**
 * 创建货币格式化器
 * 使用浏览器原生 Intl.NumberFormat API
 */
export function createCurrencyFormatter(locale: Locale): CurrencyFormatter {
  return (amount: number, currency = 'CNY') => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  };
}
