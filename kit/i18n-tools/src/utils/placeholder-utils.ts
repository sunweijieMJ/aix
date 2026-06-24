/**
 * 提取一段 i18n 文案里所有占位符的「名字」集合（忽略出现次数与顺序）。
 *
 * 兼容：
 *  - vue-i18n / vue-i18next / react-i18next：`{name}` / `{{name}}`
 *  - react-intl ICU：`{name}` / `{name, plural, ...}`（取首标识符，复杂内嵌为尽力而为）
 *
 * 用于 doctor 的 placeholder-mismatch 校验：对比 source 与 target 的名集是否一致。
 */
export function extractPlaceholderNames(value: string): Set<string> {
  const names = new Set<string>();
  // 匹配 { 或 {{ 后的首个标识符（字母/数字/下划线/点/连字符），到非标识符字符止
  const re = /\{\{?\s*([A-Za-z0-9_.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (m[1]) names.add(m[1]);
  }
  return names;
}
