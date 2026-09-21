import { describe, it, expect } from 'vitest';
import { serializeCsv, UTF8_BOM } from '../src/utils/csv-utils';

describe('serializeCsv', () => {
  it('普通字段直接拼接，带 BOM 前缀和 CRLF 行尾', () => {
    const out = serializeCsv([
      ['key', 'zh', 'en'],
      ['a.b', '你好', 'hello'],
    ]);
    expect(out.startsWith(UTF8_BOM)).toBe(true);
    expect(out).toBe(`${UTF8_BOM}key,zh,en\r\na.b,你好,hello\r\n`);
  });

  it('含逗号/引号/换行的字段用双引号包裹，内部引号双写', () => {
    const out = serializeCsv([['k', 'a,b', 'say "hi"', 'line1\nline2']]);
    expect(out).toBe(`${UTF8_BOM}k,"a,b","say ""hi""","line1\nline2"\r\n`);
  });
});

import { parseCsv } from '../src/utils/csv-utils';

describe('parseCsv', () => {
  it('解析普通行，自动剥离 BOM', () => {
    expect(parseCsv(`${UTF8_BOM}key,zh,en\r\na.b,你好,hello\r\n`)).toEqual([
      ['key', 'zh', 'en'],
      ['a.b', '你好', 'hello'],
    ]);
  });

  it('解析引号内的逗号/换行/双写引号', () => {
    expect(parseCsv(`k,"a,b","say ""hi""","line1\nline2"\r\n`)).toEqual([
      ['k', 'a,b', 'say "hi"', 'line1\nline2'],
    ]);
  });

  it('serializeCsv → parseCsv round-trip 值不变', () => {
    const rows = [
      ['key', 'zh', 'en'],
      ['btn.ok', '确定，好的', 'OK "yes"'],
      ['multi', '第一行\n第二行', ''],
    ];
    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });

  // 回归（审计 medium，csv-utils:12）：CSV 注入防护。`=1+1`、`-50%`、`@提及` 等合法文案
  // 此前原样写出，Excel 打开当公式/数字求值，回流时污染数据。修复：serializeCsv 前置 Tab 中和，
  // parseCsv 对称剥除 → CSV 里不再裸前导危险字符，且 round-trip 无损。
  it('CSV 注入防护：=+-@ 开头字段被中和且 round-trip 无损', () => {
    const rows = [
      ['key', 'zh', 'en'],
      ['a', '=1+1', '-50%'],
      ['b', '@提及', '+1'],
      ['c', '\t本就含Tab', '正常文案'],
    ];
    const csv = serializeCsv(rows);
    // CSV 文本里危险值被 "\t…" 包裹中和，不再以 = - + @ 裸开头
    expect(csv).toContain('"\t=1+1"');
    expect(csv).toContain('"\t-50%"');
    expect(csv).not.toMatch(/(^|,)=1\+1/);
    expect(csv).not.toMatch(/(^|,)-50%/);
    // round-trip 完全无损（含原本即以 Tab 开头的值）
    expect(parseCsv(csv)).toEqual(rows);
  });

  it('LF 行尾与尾随空字段', () => {
    expect(parseCsv('a,\nb,c')).toEqual([
      ['a', ''],
      ['b', 'c'],
    ]);
  });

  it('空文本返回空数组', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

import { decodeUtf8Strict } from '../src/utils/csv-utils';

describe('decodeUtf8Strict', () => {
  it('合法 UTF-8 正常解码并剥离 BOM', () => {
    const buf = Buffer.from(`${UTF8_BOM}你好,world`, 'utf8');
    expect(decodeUtf8Strict(buf, 'x.csv')).toBe('你好,world');
  });

  it('非法字节（GBK 中文）抛出友好错误', () => {
    // 0xC4 0xE3 是「你」的 GBK 编码，在 UTF-8 下非法
    const buf = Buffer.from([0xc4, 0xe3]);
    expect(() => decodeUtf8Strict(buf, 'bad.csv')).toThrow(/UTF-8/);
  });
});

/**
 * 人工用 Excel/文本编辑器改 CSV 时的三类引号手误。共同后果是「静默吞字符」——
 * 回流后 translations.json 里多出或少掉内容，import 仍报成功，故一律 fail-fast。
 */
describe('parseCsv — 非法引号一律报错而非静默吞字符', () => {
  it('闭合引号后出现多余字符（`"a"b`）→ 抛错，不把 b 并进字段', () => {
    expect(() => parseCsv('"a"b,c\r\n')).toThrow(/闭合引号/);
  });

  it('闭合引号后紧跟另一个引号（`"a""`，跨字段）→ 同样抛错', () => {
    expect(() => parseCsv('k,"a" "b"\r\n')).toThrow(/闭合引号/);
  });

  it('报错行号指向出问题的那一行', () => {
    expect(() => parseCsv('k,v\r\n"a"x,y\r\n')).toThrow(/第 2 行/);
  });

  it('字段中部出现裸引号（`5" 屏幕`）→ 抛错', () => {
    expect(() => parseCsv('k,5" 屏幕\r\n')).toThrow(/字段中部/);
  });

  it('引号在文件结束仍未闭合 → 抛错', () => {
    expect(() => parseCsv('k,"未闭合\r\n')).toThrow(/未闭合/);
  });

  it('合法的引号包裹字段不受影响（闭合后紧跟逗号/换行/EOF）', () => {
    expect(parseCsv('"a","b"\r\n"c","d"')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});
