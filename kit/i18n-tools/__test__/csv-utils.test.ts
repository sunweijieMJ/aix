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
