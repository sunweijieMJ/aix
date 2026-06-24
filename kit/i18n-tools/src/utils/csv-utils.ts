/**
 * 零依赖 CSV 工具：RFC 4180 序列化/解析 + UTF-8 BOM + 严格解码。
 *
 * 设计取舍见 docs/superpowers/specs/2026-06-24-i18n-csv-roundtrip-design.md：
 * 当前包刻意控制依赖，schema 为纯 string map，故不引 papaparse 等库。
 */

/** UTF-8 BOM。写出时前置，确保 Excel 双击打开中文不乱码。 */
export const UTF8_BOM = '﻿';

/** 单个字段按 RFC4180 转义：含逗号/引号/换行时用双引号包裹，内部引号双写。 */
function escapeField(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/** 将二维字符串数组序列化为 CSV 文本（含 BOM 前缀，CRLF 行分隔，结尾带换行）。 */
export function serializeCsv(rows: string[][]): string {
  const body = rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
  return `${UTF8_BOM}${body}\r\n`;
}

/**
 * 解析 RFC4180 CSV 文本为二维数组。
 * 支持引号内逗号/换行/双写引号；自动跳过开头 BOM；兼容 CRLF 与 LF。
 */
export function parseCsv(text: string): string[][] {
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      if (input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // 无尾随换行时 flush 最后一个字段/行
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * 严格按 UTF-8 解码文件 Buffer。非法字节（如 Excel 误存为 GBK）直接抛错，
 * 给出「另存为 CSV UTF-8」提示，避免静默乱码污染回写数据。剥离开头 BOM。
 */
export function decodeUtf8Strict(buf: Buffer, filePath: string): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Error(
      `[i18n-tools] CSV 文件不是合法 UTF-8 编码：${filePath}。` +
        `请用 Excel「另存为 → CSV UTF-8」后重试。`,
    );
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
