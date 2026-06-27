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
 * 配置常量
 */
export const CONFIG = {
  /** 中文字符正则表达式 */
  CHINESE_REGEX: /[\u4e00-\u9fff]/,
} as const;

/**
 * 这些元素的内容是逐字代码 / 预格式文本，不参与 i18n 提取（含其所有后代节点）。
 * Vue 模板与 React JSX 共用：遇到这些标签直接跳过整棵子树，避免把示例代码
 * （如文档里的 `<code>&lt;script setup&gt;</code>`）灌进 locale。
 */
export const NON_EXTRACTABLE_ELEMENT_TAGS = new Set(['code', 'pre']);

/**
 * 操作模式说明映射
 */
export const MODE_DESCRIPTIONS: Record<string, string> = {
  [ModeName.AUTOMATIC]: '自动化流程 - 一键完成从提取到导出的所有步骤',
  [ModeName.GENERATE]: '代码生成 - 扫描源码提取中文并生成国际化调用',
  [ModeName.PICK]: '提取待翻译 - 从国际化文件中提取未翻译条目',
  [ModeName.TRANSLATE]: 'AI翻译 - 调用AI服务将中文翻译为英文',
  [ModeName.MERGE]: '合并翻译 - 将翻译结果合并回主文件',
  [ModeName.RESTORE]: '代码还原 - 将国际化调用还原为中文（调试用）',
  [ModeName.EXPORT]: '语言包导出 - 生成最终的多语言文件',
  [ModeName.DOCTOR]: '健康检查 - 体检 locale 文件结构与源码对账',
  [ModeName.CSV_EXPORT]: 'CSV 导出 - 把待翻译/已翻译条目导出为表格发人翻译或审核',
  [ModeName.CSV_IMPORT]:
    'CSV 回流 - 把翻译/审核好的 CSV 写回 untranslated/translations（按 key 归属自动路由）',
  [ModeName.PRUNE]: '清理孤儿 key - 删除源码已不再引用的 locale 条目',
};
