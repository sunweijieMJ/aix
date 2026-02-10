import { ModeName } from './types';

/**
 * 文件名常量
 */
export const FILES = {
  /** 未翻译文件名 */
  UNTRANSLATED_JSON: 'untranslated.json',
  /** 翻译文件名 */
  TRANSLATIONS_JSON: 'translations.json',
  /** 英文语言包文件名 */
  EN_US_JSON: 'en-US.json',
  /** 中文语言包文件名 */
  ZH_CN_JSON: 'zh-CN.json',
} as const;

/**
 * 配置常量
 */
export const CONFIG = {
  /** 中文字符正则表达式 */
  CHINESE_REGEX: /[\u4e00-\u9fff]/,
  /** 支持的文件扩展名 */
  SUPPORTED_EXTENSIONS: ['.tsx', '.jsx', '.ts', '.js'] as string[],
  /** 中文映射 */
  CHINESE_MAPPINGS: {
    确认: 'confirm',
    取消: 'cancel',
    删除: 'delete',
    添加: 'add',
    编辑: 'edit',
    保存: 'save',
    提交: 'submit',
    搜索: 'search',
    登录: 'login',
    退出: 'logout',
    成功: 'success',
    失败: 'failed',
    错误: 'error',
    警告: 'warning',
    提示: 'tip',
    用户: 'user',
    请输入: 'please_input',
    请选择: 'please_select',
  } as const,
  /** ID分隔符 */
  ID_SEPARATOR: '__',
} as const;

/**
 * 支持的语言类型
 */
export const LOCALE_TYPE = {
  ZH_CN: 'zh-CN',
  EN_US: 'en-US',
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
