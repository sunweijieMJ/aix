const NUMERIC_TOKEN_PATTERN = /\d[\d/:\-.T]*\d|\d/g;
/** 至少含一个 Unicode 字母类字符（含中文/日文/韩文），用于过滤纯数字/符号/空白文本 */
const TRANSLATABLE_PATTERN = /\p{L}/u;

export interface NormalizedText {
  normalized: string;
  restore: (translated: string) => string;
}

export function isTranslatable(text: string): boolean {
  return TRANSLATABLE_PATTERN.test(text);
}

/**
 * 把文本中的数字/日期序列替换成占位符 token（如 "共 5 条" -> "共 {N0} 条"）参与翻译，
 * 避免同一模板因数字不同（分页/计数等）被当成不同原文反复翻译、语言包无法收敛。
 *
 * 已知限制：依赖机翻 provider 原样保留 `{N0}` 这类占位符 token（主流 MT 引擎通常如此，
 * 类似 ICU MessageFormat 占位符的处理方式）。若 provider 丢弃了占位符，restore 不会抛错，
 * 但对应数字会在译文中缺失——这是可接受的降级，不做更复杂的兜底。
 */
export function normalize(text: string): NormalizedText {
  const tokens: string[] = [];
  const normalized = text.replace(NUMERIC_TOKEN_PATTERN, (match) => {
    tokens.push(match);
    return `{N${tokens.length - 1}}`;
  });

  return {
    normalized,
    restore: (translated: string) =>
      translated.replace(/\{N(\d+)\}/g, (_match, index: string) => tokens[Number(index)] ?? ''),
  };
}
