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
  /** 支持的文件扩展名 */
  SUPPORTED_EXTENSIONS: ['.tsx', '.jsx', '.ts', '.js'] as string[],
} as const;

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
};
