import { ModeName } from './types';

/**
 * 文件名常量
 */
export const FILES = {
  /** 未翻译文件名 */
  UNTRANSLATED_JSON: 'untranslated.json',
  /** 翻译文件名 */
  TRANSLATIONS_JSON: 'translations.json',
} as const;

/**
 * CJK 统一汉字基本区（U+4E00–U+9FFF）的正则字符类内容（不含方括号）。
 *
 * 全库唯一来源：凡是「判定 / 保留中文字符」的正则都必须用模板拼接本常量，不要另写
 * 字面量区间。多处各写一遍就会混入 U+9FA5 / U+9FFF 这类不同上界——上界不一致时
 * U+9FA6–U+9FFF 的扩充汉字在一处算中文、在另一处不算，表现为个别文案能提取却生不出
 * 语义 ID（或反之），且不报任何错。
 */
export const CHINESE_CHAR_RANGE = '\\u4e00-\\u9fff';

/**
 * 「含中文字符」判定正则（无 g 标志，可安全跨调用复用）。
 *
 * ast-guards 直接用本常量（它刻意保持零依赖，不能反向 import file-utils）；
 * 对外门面是 FileUtils.containsChinese，两者共用这一个正则，避免第二种中文判定口径。
 */
export const CHINESE_CHAR_RE = new RegExp(`[${CHINESE_CHAR_RANGE}]`);

/**
 * 占位符「参数名」允许出现的字符集（正则字符类内容，不含方括号）。
 *
 * 全库唯一来源：doctor/translate 的名集采集（placeholder-utils）与 restore 的双花括号归一
 * （message-shape 的 PLACEHOLDER_NAME）必须同集合——两处不一致时，一侧识别得出的占位符在
 * 另一侧「不是占位符」：restore 归一漏掉 `{{a-b}}` 会让双花括号库往返丢变量，doctor 漏掉
 * `{$route}` 会对该占位符失明、放行不匹配的译文。
 *
 * 取「两侧并集」而非交集：匹配端宁可宽松——locale 文件可以是人工编写的，占位符名不限于
 * 本工具生成的形态。生成端（getVariableNameFromExpression）有意只输出更严格的子集
 * （合法 JS 标识符字符），因为该名会作为 values 对象的裸键写进源码，含 `-` 会产出语法错误。
 */
export const PLACEHOLDER_NAME_CHARS = `A-Za-z0-9_$.${CHINESE_CHAR_RANGE}-`;

/**
 * 这些元素的内容是逐字代码 / 预格式文本，不参与 i18n 提取（含其所有后代节点）。
 * Vue 模板与 React JSX 共用：遇到这些标签直接跳过整棵子树，避免把示例代码
 * （如文档里的 `<code>&lt;script setup&gt;</code>`）灌进 locale。
 */
export const NON_EXTRACTABLE_ELEMENT_TAGS = new Set(['code', 'pre']);

/**
 * 操作模式说明映射。
 *
 * 键类型收紧为 ModeName：CLI 的 --help 模式清单由本表遍历生成，用宽松的 `Record<string, string>`
 * 时新增模式漏登记不报错，帮助里就会少一行。
 */
export const MODE_DESCRIPTIONS: Record<ModeName, string> = {
  [ModeName.AUTOMATIC]: '自动化流程 - 一键完成从提取到导出的所有步骤',
  [ModeName.GENERATE]: '代码生成 - 扫描源码提取中文并生成国际化调用',
  [ModeName.PICK]: '提取待翻译 - 从国际化文件中提取未翻译条目',
  [ModeName.TRANSLATE]: 'AI翻译 - 调用AI服务翻译为配置的目标语言',
  [ModeName.MERGE]: '合并翻译 - 将翻译结果合并回主文件',
  [ModeName.RESTORE]: '代码还原 - 将国际化调用还原为中文（调试用）',
  [ModeName.EXPORT]: '语言包导出 - 生成最终的多语言文件',
  [ModeName.DOCTOR]: '健康检查 - 体检 locale 文件结构与源码对账',
  [ModeName.CSV_EXPORT]: 'CSV 导出 - 把待翻译/已翻译条目导出为表格发人翻译或审核',
  [ModeName.CSV_IMPORT]:
    'CSV 回流 - 把翻译/审核好的 CSV 写回 untranslated/translations（按 key 归属自动路由）',
  [ModeName.PRUNE]: '清理孤儿 key - 删除源码已不再引用的 locale 条目',
};

/**
 * CLI 可用模式清单（--help 展示顺序 + --mode choices 的单一来源）。
 * 由 MODE_DESCRIPTIONS 派生，新增模式只需在上表登记一次，两处自动同步。
 */
export const MODE_LIST = Object.keys(MODE_DESCRIPTIONS) as ModeName[];

/** --help 里每个模式前的图标（纯展示）。 */
export const MODE_ICONS: Record<ModeName, string> = {
  [ModeName.AUTOMATIC]: '🚀',
  [ModeName.GENERATE]: '📝',
  [ModeName.PICK]: '📤',
  [ModeName.TRANSLATE]: '🤖',
  [ModeName.MERGE]: '📥',
  [ModeName.RESTORE]: '🔄',
  [ModeName.EXPORT]: '📦',
  [ModeName.DOCTOR]: '🩺',
  [ModeName.CSV_EXPORT]: '🧾',
  [ModeName.CSV_IMPORT]: '📩',
  [ModeName.PRUNE]: '🧹',
};
