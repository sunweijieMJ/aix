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
 * 校验 --langs 是否都属于已配置的 target 语种：含未配置项即抛错（而非静默丢弃），
 * 否则 CI 脚本里的拼写错误（如 en-US,typo）会悄悄只写一部分。
 * csv-export 的 resolveLangs 与 csv-import 共用同一口径，避免谓词与错误文案手工对齐漂移。
 * 仅依赖字符串数组，保持本模块零依赖。
 */
export function assertLangsAreTargets(targets: readonly string[], langs: readonly string[]): void {
  const invalid = langs.filter((l) => !targets.includes(l));
  if (invalid.length > 0) {
    throw new Error(
      `[i18n-tools] --langs 含未配置的目标语言：${invalid.join(', ')}（可选：${targets.join(', ')}）`,
    );
  }
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
      // RFC4180：引号只能出现在字段起始。出现在非引号字段中部（如人工填入 `5" 屏幕`）
      // 即为非法格式——此前会静默翻进引号模式吞掉后续逗号/换行甚至整行，导致回流丢数据
      // 且仍报成功。这里直接报错，让用户修正而非静默损坏。
      if (field !== '') {
        throw new Error(
          `[i18n-tools] CSV 格式非法：第 ${rows.length + 1} 行字段中部出现未转义的引号 (")。` +
            `若单元格内容确需包含引号，请用引号包裹整个单元格并把内部引号写成两个（""）。`,
        );
      }
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

  // 引号在文件结束仍未闭合：同样是非法 CSV，静默 flush 会把跨行内容并成一格丢数据。
  if (inQuotes) {
    throw new Error(
      `[i18n-tools] CSV 格式非法：第 ${rows.length + 1} 行存在未闭合的引号 (")，` +
        `请检查是否有单元格漏写了结束引号。`,
    );
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
 * 给出「另存为 CSV UTF-8」提示，避免静默乱码污染回写数据。
 *
 * BOM 无需手动剥离：TextDecoder 默认 ignoreBOM:false，解码时已吞掉开头的 U+FEFF。
 */
export function decodeUtf8Strict(buf: Buffer, filePath: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Error(
      `[i18n-tools] CSV 文件不是合法 UTF-8 编码：${filePath}。` +
        `请用 Excel「另存为 → CSV UTF-8」后重试。`,
    );
  }
}
