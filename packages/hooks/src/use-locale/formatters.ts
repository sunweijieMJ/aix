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
 * 使用浏览器原生 Intl.DateTimeFormat API，Intl 实例在工厂内预创建并复用
 */
export function createDateFormatter(locale: Locale): DateFormatter {
  const shortFmt = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const longFmt = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  return {
    short: (date: Date) => shortFmt.format(date),
    long: (date: Date) => longFmt.format(date),
    time: (date: Date) => timeFmt.format(date),
    relative: (date: Date) => {
      const diff = date.getTime() - Date.now();
      const absDiff = Math.abs(diff);

      if (absDiff < 1000 * 60) {
        return rtf.format(Math.trunc(diff / 1000), 'second');
      }
      if (absDiff < 1000 * 60 * 60) {
        return rtf.format(Math.trunc(diff / (1000 * 60)), 'minute');
      }
      if (absDiff < 1000 * 60 * 60 * 24) {
        return rtf.format(Math.trunc(diff / (1000 * 60 * 60)), 'hour');
      }
      if (absDiff < 1000 * 60 * 60 * 24 * 30) {
        return rtf.format(Math.trunc(diff / (1000 * 60 * 60 * 24)), 'day');
      }
      if (absDiff < 1000 * 60 * 60 * 24 * 365) {
        return rtf.format(
          Math.trunc(diff / (1000 * 60 * 60 * 24 * 30)),
          'month',
        );
      }
      return rtf.format(Math.trunc(diff / (1000 * 60 * 60 * 24 * 365)), 'year');
    },
  };
}

/**
 * 创建数字格式化器
 * 使用浏览器原生 Intl.NumberFormat API，固定选项的实例预创建，变参实例按需缓存
 */
export function createNumberFormatter(locale: Locale): NumberFormatter {
  const percentFmt = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const compactFmt = new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
  });
  const decimalCache = new Map<number, Intl.NumberFormat>();

  return {
    decimal: (num: number, digits = 2) => {
      if (!decimalCache.has(digits)) {
        decimalCache.set(
          digits,
          new Intl.NumberFormat(locale, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          }),
        );
      }
      return decimalCache.get(digits)!.format(num);
    },
    percent: (num: number) => percentFmt.format(num),
    compact: (num: number) => compactFmt.format(num),
  };
}

/**
 * 创建货币格式化器
 * 使用浏览器原生 Intl.NumberFormat API，按币种缓存实例
 */
export function createCurrencyFormatter(locale: Locale): CurrencyFormatter {
  const cache = new Map<string, Intl.NumberFormat>();

  return (amount: number, currency = 'CNY') => {
    if (!cache.has(currency)) {
      cache.set(
        currency,
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
        }),
      );
    }
    return cache.get(currency)!.format(amount);
  };
}
