/**
 * 文案空白归一：去首尾空白 + 把内部连续空白（含换行 / 制表符）压缩为单个空格。
 *
 * 全库唯一实现（IdReuseResolver / Glossary 的查表键、LocaleValueLinter 的语义查重都用它）：
 * 若各处自写归一规则，一处补规则（如全角空格归一）后同一段原文在两张表里会算成不同键——
 * ID 复用静默失效、词表命中率静默下降，且不会有任何报错。
 *
 * 注意：这是**查表键**口径，多处历史数据（locale 文件里的 key、词表文件里的条目）
 * 依赖它保持稳定。修改本函数等于让全部存量查表键失效，必须整体评估。
 */
export function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** 单行化 + 截断的预览文本：报告 / 告警里引用 locale 值时的统一口径。 */
export function previewText(text: string, maxLen = 80): string {
  const single = collapseWhitespace(text);
  return single.length > maxLen ? `${single.slice(0, maxLen)}…` : single;
}
