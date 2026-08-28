/**
 * 文案空白归一：去首尾空白 + 把内部连续空白（含换行 / 制表符）压缩为单个空格。
 *
 * 全库唯一实现。此前 IdReuseResolver（ID 复用查表键）、Glossary（词表查表键）、
 * LocaleValueLinter（语义查重 canonicalize + preview）、DoctorProcessor（preview）
 * 各写一遍同一段 `trim + replace(/\s+/g, ' ')`：一旦有人在某一处补规则（如加半角
 * 全角空格归一），其余查表点仍用旧口径，同一段原文在两张表里算成不同键——ID 复用
 * 静默失效、词表命中率静默下降，且不会有任何报错。
 *
 * 注意：这是**查表键**口径，多处历史数据（locale 文件里的 key、词表文件里的条目）
 * 依赖它保持稳定。修改本函数等于让全部存量查表键失效，必须整体评估。
 */
export function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
